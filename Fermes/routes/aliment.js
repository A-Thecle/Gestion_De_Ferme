const express = require ('express');

const router = express.Router();


router.post('/ajoutAliment', (req, res) => {
    const { nom, unite, prix_unitaire } = req.body;

    // Validation des données requises
    if (!nom || !unite || prix_unitaire === undefined) {
        return res.status(400).json({ 
            message: "Le nom, l'unité et le prix unitaire sont obligatoires",
            requiredFields: ['nom', 'unite', 'prix_unitaire']
        });
    }

    // Validation du prix unitaire
    if (isNaN(prix_unitaire) || prix_unitaire < 0) {
        return res.status(400).json({ 
            message: "Le prix unitaire doit être un nombre positif",
            field: 'prix_unitaire'
        });
    }

    req.DB.beginTransaction(err => {
        if (err) return res.status(500).json(err);

        // Vérifier si l'aliment existe déjà avec les mêmes caractéristiques
        req.DB.query(
            `SELECT id FROM aliments WHERE nom = ? AND unite = ? AND prix_unitaire = ?`,
            [nom, unite, prix_unitaire],
            (err, results) => {
                if (err) return req.DB.rollback(() => res.status(500).json(err));

                if (results.length > 0) {
                    // Aliment identique existe déjà
                    req.DB.rollback(() => {
                        res.status(409).json({ 
                            message: "Cet aliment existe déjà avec les mêmes caractéristiques",
                            alimentId: results[0].id
                        });
                    });
                } else {
                    // Nouvel aliment - création
                    req.DB.query(
                        `INSERT INTO aliments SET ?`,
                        { nom, unite, prix_unitaire },
                        (err, results) => {
                            if (err) return req.DB.rollback(() => res.status(500).json(err));
                            
                            const alimentId = results.insertId;
                            req.DB.commit(err => {
                                if (err) return req.DB.rollback(() => res.status(500).json(err));
                                res.status(201).json({ 
                                    message: "Aliment créé avec succès",
                                    alimentId,
                                    action: 'create'
                                });
                            });
                        }
                    );
                }
            }
        );
    });
});
// Récupérer tous les aliments
router.get('/getAliments', (req, res) => {
    let query = "SELECT * FROM aliments";
    
    req.DB.query(query, (err, results) => {
        if (!err) {
            return res.status(200).json(results);
        } else {
            return res.status(500).json(err);
        }
    });
});

router.get('/getAnimaux', (req, res) => {
    let query = "SELECT * FROM animaux";
    
    req.DB.query(query, (err, results) => {
        if (!err) {
            return res.status(200).json(results);
        } else {
            return res.status(500).json(err);
        }
    });
});


router.get('/getAlimentsAvecStock', (req, res) => {
  const query = `
    SELECT 
      a.id,
      a.nom,
      a.unite,
      a.prix_unitaire,
      COALESCE(
        (SELECT SUM(
          CASE 
            WHEN s.operation_type = 'entree' THEN s.quantite
            WHEN s.operation_type = 'sortie' THEN -ABS(s.quantite)
            WHEN s.operation_type = 'ajustement' THEN s.quantite
            ELSE 0
          END
        ) 
        FROM stock_aliments s 
        WHERE s.aliment_id = a.id),
        0
      ) AS stock
    FROM aliments a
  `;

  req.DB.query(query, (err, results) => {
    if (!err) {
      return res.status(200).json(results);
    } else {
      console.error('Erreur:', err);
      return res.status(500).json({ message: 'Erreur serveur', error: err });
    }
  });
});

  
// Récupérer un aliment par son ID
router.get('/getById/:id', (req, res) => {
    const id = req.params.id;
    let query = "SELECT id, nom, unite, prix_unitaire FROM aliments WHERE id = ?";
    
    req.DB.query(query, [id], (err, results) => {
        if (!err && results.length > 0) {
            return res.status(200).json(results[0]); // ← retourner seulement le premier objet
        }
         else {
            return res.status(500).json(err);
        }
    });
});

// Mettre à jour un aliment
router.patch('/update/:id', (req, res) => {
    const { nom, unite, prix_unitaire } = req.body;
    const id = req.params.id;
  
    // Validation
    if (!nom || !unite || prix_unitaire === undefined) {
      return res.status(400).json({
        message: "Les champs nom, unité et prix unitaire sont obligatoires",
        requiredFields: ['nom', 'unite', 'prix_unitaire']
      });
    }
  
    if (isNaN(prix_unitaire) || prix_unitaire < 0) {
      return res.status(400).json({
        message: "Le prix unitaire doit être un nombre positif",
        field: 'prix_unitaire'
      });
    }
  
    req.DB.beginTransaction(err => {
      if (err) return res.status(500).json(err);
  
      // Mise à jour dans la table aliments
      const updateAlimentQuery = `UPDATE aliments SET nom = ?, unite = ?, prix_unitaire = ? WHERE id = ?`;
      req.DB.query(updateAlimentQuery, [nom, unite, prix_unitaire, id], (err, results) => {
        if (err) return req.DB.rollback(() => res.status(500).json(err));
  
        if (results.affectedRows === 0) {
          return req.DB.rollback(() => res.status(404).json({ message: "Aucun aliment trouvé pour l'ID fourni." }));
        }
  
        // Aucune mise à jour de stock_aliments ici, car ces champs n'y existent pas
        req.DB.commit(err => {
          if (err) return req.DB.rollback(() => res.status(500).json(err));
          res.status(200).json({ message: "Aliment mis à jour avec succès", action: 'update' });
        });
      });
    });
  });
  
  

// Supprimer un aliment


router.delete('/delete/:id', (req, res) => {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
        return res.status(400).json({ 
            success: false,
            message: "ID doit être un nombre" 
        });
    }

    req.DB.beginTransaction(err => {
        if (err) {
            console.error("Erreur transaction:", err);
            return res.status(500).json({ 
                success: false,
                message: "Erreur de transaction"
            });
        }

        // 1. D'abord supprimer les entrées dans rationalimentaire
        const deleteRationQuery = "DELETE FROM rationalimentaire WHERE aliment_id = ?";
        req.DB.query(deleteRationQuery, [id], (err0, result0) => {
            if (err0) {
                console.error("Erreur suppression ration:", err0);
                return req.DB.rollback(() => res.status(500).json({
                    success: false,
                    message: "Échec suppression des rations"
                }));
            }

            // 2. Ensuite supprimer les stocks associés
            const deleteStockQuery = "DELETE FROM stock_aliments WHERE aliment_id = ?";
            req.DB.query(deleteStockQuery, [id], (err1, result1) => {
                if (err1) {
                    console.error("Erreur suppression stock:", err1);
                    return req.DB.rollback(() => res.status(500).json({
                        success: false,
                        message: "Échec suppression stocks"
                    }));
                }

                // 3. Finalement supprimer l'aliment
                const deleteAlimentQuery = "DELETE FROM aliments WHERE id = ?";
                req.DB.query(deleteAlimentQuery, [id], (err2, result2) => {
                    if (err2) {
                        console.error("Erreur suppression aliment:", err2);
                        return req.DB.rollback(() => res.status(500).json({
                            success: false,
                            message: "Échec suppression aliment"
                        }));
                    }

                    if (result2.affectedRows === 0) {
                        return req.DB.rollback(() => res.status(404).json({
                            success: false,
                            message: "Aucun aliment trouvé avec cet ID"
                        }));
                    }

                    // 4. Valider la transaction
                    req.DB.commit(err => {
                        if (err) {
                            console.error("Erreur commit:", err);
                            return req.DB.rollback(() => res.status(500).json({
                                success: false,
                                message: "Erreur validation transaction"
                            }));
                        }
                        
                        res.status(200).json({
                            success: true,
                            message: "Suppression réussie",
                            deletedAlimentId: id
                        });
                    });
                });
            });
        });
    });
});


  
router.get('/aliments', (req, res) => {
    const { search } = req.query;
    
    let query = `SELECT * FROM aliments`;
    let params = [];
    
    if (search) {
        query += ` WHERE nom LIKE ?`;
        params.push(`%${search}%`);
    }
    
   req.DB.query(query, params, (err, results) => {
        if (err) {
            return res.status(500).json({ 
                message: "Erreur lors de la recherche d'aliments",
                error: err.message 
            });
        }
        res.status(200).json(results);
    });
});
//recherche
router.get('/searchaliments', (req, res) => {
  const { search } = req.query;
  
  let query = `SELECT * FROM aliments`;
  let params = [];
  
  if (search) {
      query += ` WHERE LOWER(nom) LIKE ?`;  // LOWER() déjà appliqué à la valeur
      params.push(`%${search.toLowerCase()}%`);
  }
  
  req.DB.query(query, params, (err, results) => {
      if (err) {
          console.error('Erreur recherche aliments:', err);
          return res.status(500).json({ 
              message: "Erreur lors de la recherche d'aliments",
              error: err.message  
          });
      }
      res.status(200).json(results);
  });
});



module.exports = router;