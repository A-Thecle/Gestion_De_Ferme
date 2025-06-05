const express = require('express');

const router = express.Router();

// Vérifie le stock avant une sortie
function checkStock(aliment_id, quantite, callback) {
  const stockQuery = 'SELECT SUM(quantite) AS stock FROM stock_aliments WHERE aliment_id = ?';
  req.DB.query(stockQuery, [aliment_id], (err, results) => {
    if (err) return callback(err);
    const stock = results[0].stock || 0;
    callback(null, stock >= quantite);
  });
}
router.put('/modifierStock/:id', (req, res) => {
  const stockId = req.params.id;
  const { aliment_id, quantite, motif } = req.body;

  if (!aliment_id || quantite === undefined) {
    return res.status(400).json({
      message: "aliment_id et quantite sont requis pour modifier un stock."
    });
  }

  // Récupérer le stock actuel
  req.DB.query(
    'SELECT COALESCE(SUM(quantite), 0) AS stock_actuel FROM stock_aliments WHERE aliment_id = ?',
    [aliment_id],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: "Erreur lors de la récupération du stock actuel." });
      }

      const stockActuel = results[0].stock_actuel;
      const difference = quantite - stockActuel;

      if (difference === 0) {
        return res.status(200).json({ message: "Aucune modification nécessaire, stock déjà à jour." });
      }

      const ajustement = {
        aliment_id,
        quantite: difference,
        operation_type: 'ajustement',
        motif: motif || 'Ajustement de stock',
        date_ajout: new Date()
      };

      // On insère un ajustement lié à ce stockId
      req.DB.query('INSERT INTO stock_aliments SET ?', ajustement, (err, result) => {
        if (err) {
          return res.status(500).json({ message: "Erreur lors de l’ajustement du stock." });
        }

        res.status(200).json({
          message: "Stock ajusté avec succès.",
          stockId: stockId,
          mouvementId: result.insertId,
          ancienStock: stockActuel,
          nouveauStock: quantite
        });
      });
    }
  );
});



router.post('/ajoutStock', (req, res) => {
  const { aliment_id, quantite, operation_type, motif } = req.body;

  // Validation des données
  if (!aliment_id || quantite === undefined || !operation_type) {
      return res.status(400).json({ 
          message: "L'ID aliment, la quantité et le type d'opération sont obligatoires",
          requiredFields: ['aliment_id', 'quantite', 'operation_type']
      });
  }

  if (!['entree', 'sortie', 'ajustement'].includes(operation_type)) {
      return res.status(400).json({ 
          message: "Type d'opération invalide",
          validTypes: ['entree', 'sortie', 'ajustement']
      });
  }

 req.DB.beginTransaction(err => {
      if (err) return res.status(500).json(err);

      // Pour les sorties, vérifier le stock disponible
      if (operation_type === 'sortie') {
          req.DB.query(
              `SELECT COALESCE(SUM(quantite), 0) AS stock FROM stock_aliments WHERE aliment_id = ?`,
              [aliment_id],
              (err, results) => {
                  if (err) return req.DB.rollback(() => res.status(500).json(err));
                  
                  const stockActuel = results[0].stock;
                  if (stockActuel < quantite) {
                      return req.DB.rollback(() => res.status(400).json({ 
                          message: "Stock insuffisant",
                          stockActuel,
                          quantiteDemandee: quantite
                      }));
                  }
                  proceedWithStockUpdate();
              }
          );
      } else {
          proceedWithStockUpdate();
      }

      function proceedWithStockUpdate() {
          const quantiteSignee = operation_type === 'entree' ? Math.abs(quantite) : -Math.abs(quantite);
          
          req.DB.query(
              `INSERT INTO stock_aliments SET ?`,
              {
                  aliment_id,
                  quantite: quantiteSignee,
                  operation_type,
                  motif: motif || `Mouvement de stock ${operation_type}`,
                  date_ajout: new Date()
              },
              (err, results) => {
                  if (err) return req.DB.rollback(() => res.status(500).json(err));
                  
                  req.DB.commit(err => {
                      if (err) return req.DB.rollback(() => res.status(500).json(err));
                      res.status(201).json({ 
                          message: "Mouvement de stock enregistré",
                          mouvementId: results.insertId
                      });
                  });
              }
          );
      }
  });
});
// Ajout d'un mouvement de stock
router.post('/mouvementStock', (req, res) => {
  const { aliment_id, quantite, operation_type, motif } = req.body;

  if (!aliment_id || !quantite || !operation_type) {
    return res.status(400).json({ error: "Champs obligatoires manquants" });
  }

  if (!['entree', 'sortie', 'ajustement'].includes(operation_type)) {
    return res.status(400).json({ error: "Type d'opération invalide" });
  }

  const quantiteSignee = operation_type === 'entree' ? Math.abs(quantite) : -Math.abs(quantite);

  const proceedInsertion = () => {
    const insertQuery = `
      INSERT INTO stock_aliments 
      (aliment_id, quantite, operation_type, motif, date_ajout)
      VALUES (?, ?, ?, ?, CURDATE())
    `;
    req.DB.query(insertQuery, [aliment_id, quantiteSignee, operation_type, motif || null], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });

      const stockQuery = 'SELECT SUM(quantite) AS stock FROM stock_aliments WHERE aliment_id = ?';
      req.DB.query(stockQuery, [aliment_id], (err2, results2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        const stockActuel = results2[0].stock || 0;
        res.status(201).json({
          message: "Mouvement enregistré",
          stock_actuel: stockActuel
        });
      });
    });
  };

  if (operation_type === 'sortie') {
    checkStock(aliment_id, Math.abs(quantite), (err, stockOk) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!stockOk) {
        return res.status(400).json({ error: "Stock insuffisant" });
      }
      proceedInsertion();
    });
  } else {
    proceedInsertion();
  }
});

// Historique des mouvements
router.get('/historiqueStock', (req, res) => {
  const query = `
    SELECT 
      sa.id,
      a.nom AS aliment,
      sa.quantite,
      a.unite,
      sa.operation_type,
      sa.motif,
      sa.date_ajout AS date_ajout
    FROM stock_aliments sa
    JOIN aliments a ON sa.aliment_id = a.id
    ORDER BY sa.date_ajout DESC, sa.id DESC
  `;
 req.DB.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(200).json(results);
  });
});

// Stock actuel
router.get('/stockActuel', (req, res) => {
  const query = `
    SELECT 
      a.id,
      a.nom,
      a.unite,
      COALESCE(SUM(sa.quantite), 0) AS quantite,
      a.prix_unitaire,
      (COALESCE(SUM(sa.quantite), 0) * a.prix_unitaire) AS valeur_stock
    FROM aliments a
    LEFT JOIN stock_aliments sa ON a.id = sa.aliment_id
    GROUP BY a.id
    ORDER BY a.nom
  `;
  req.DB.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(200).json(results);
  });
});

// Alertes de stock
router.get('/alertesStock', (req, res) => {
  const query = `
    SELECT 
      a.id,
      a.nom,
      a.unite,
      SUM(sa.quantite) AS stock_actuel
    FROM aliments a
    LEFT JOIN stock_aliments sa ON a.id = sa.aliment_id
    GROUP BY a.id
    HAVING stock_actuel <= 5 OR stock_actuel IS NULL
  `;
  req.DB.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(200).json(results);
  });
});

// Modifier un mouvement
router.put('/mouvements/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const updateQuery = 'UPDATE stock_aliments SET ? WHERE id = ?';
  req.DB.query(updateQuery, [updates, id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(200).json({ message: "Mouvement mis à jour" });
  });
});

// Supprimer un mouvement
router.delete('/mouvements/:id', (req, res) => {
  const { id } = req.params;

  const deleteQuery = 'DELETE FROM stock_aliments WHERE id = ?';
  req.DB.query(deleteQuery, [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(204).end();
  });
});

// Dans votre backend (Node.js)
router.get('/searchStock', (req, res) => {  // Changé de '/Searchstock' à '/searchStock'
  const { search } = req.query;
  
  let query = `
    SELECT 
      a.id,
      a.nom,
      a.unite,
      COALESCE(SUM(sa.quantite), 0) AS quantite,
      a.prix_unitaire,
      (COALESCE(SUM(sa.quantite), 0) * a.prix_unitaire) AS valeur_stock
    FROM aliments a
    LEFT JOIN stock_aliments sa ON a.id = sa.aliment_id
  `;

  let params = [];

  if (search) {
    query += ` WHERE LOWER(a.nom) LIKE ?`;
    params.push(`%${search.toLowerCase()}%`);
  }

  query += ` GROUP BY a.id ORDER BY a.nom`;

  req.DB.query(query, params, (err, results) => {
    if (err) {
      console.error('Erreur recherche stock:', err);
      return res.status(500).json({ 
        success: false,
        message: "Erreur lors de la recherche du stock",
        error: err.message  
      });
    }
    
    res.status(200).json(results); // Retourne directement les résultats
  });
});
router.get('/releveAliments', (req, res) => {
  const { date_debut, date_fin } = req.query;

  if (!date_debut || !date_fin) {
    return res.status(400).json({ error: "Les paramètres date_debut et date_fin sont requis" });
  }

  // Formatage des dates en français (format jj/mm/yyyy)
  const formatDateFr = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = String(date.getDate()).padStart(2, '0'); // Ajouter un zéro devant les jours < 10
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Mois de 1 à 12
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const query = `
    SELECT 
      sa.id,
      a.nom AS aliment,
      sa.quantite,
      a.unite,
      'entree' AS type_operation,
      sa.operation_type AS sous_type,
      sa.motif,
      sa.date_ajout AS date,
      a.prix_unitaire,
      (sa.quantite * a.prix_unitaire) AS montant_total,
      NULL AS animal_type
    FROM stock_aliments sa
    JOIN aliments a ON sa.aliment_id = a.id
    WHERE sa.date_ajout BETWEEN ? AND ? 
      AND sa.operation_type = 'entree'

    UNION ALL

    SELECT 
      ra.id,
      a.nom AS aliment,
      ra.quantite_consommee AS quantite,
      a.unite,
      'sortie' AS type_operation,
      'ration' AS sous_type,
      CONCAT('Ration pour: ', an.type) AS motif,
      ra.date_consommation AS date,
      a.prix_unitaire,
      ra.montant_total,
      an.type AS animal_type
    FROM rationalimentaire ra
    JOIN aliments a ON ra.aliment_id = a.id
    JOIN animaux an ON ra.type_animal_id = an.animalId
    WHERE ra.date_consommation BETWEEN ? AND ?

    ORDER BY date DESC, id DESC
  `;

  req.DB.query(query, [date_debut, date_fin, date_debut, date_fin], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    const totaux = results.reduce((acc, row) => {
      const unite = row.unite;
      if (!acc.entrees[unite]) acc.entrees[unite] = { quantite: 0, montant: 0 };
      if (!acc.sorties[unite]) acc.sorties[unite] = { quantite: 0, montant: 0 };

      if (row.type_operation === 'entree') {
        acc.entrees[unite].quantite += row.quantite;
        acc.entrees[unite].montant += row.montant_total || 0;
      } else {
        acc.sorties[unite].quantite += row.quantite;
        acc.sorties[unite].montant += row.montant_total || 0;
      }

      return acc;
    }, { 
      entrees: {}, 
      sorties: {} 
    });

    res.status(200).json({
      periode: `${formatDateFr(date_debut)} à ${formatDateFr(date_fin)}`,
      operations: results,
      totaux
    });
  });
});



module.exports = router;
