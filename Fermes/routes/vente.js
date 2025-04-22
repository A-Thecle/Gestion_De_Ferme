const express = require ('express');

const router = express.Router();


// Ajouter une vente
router.post('/ajoutVente', (req, res) => {
    let vente = req.body;
    let query = "INSERT INTO vente (client_id, produit_id, quantite, prix_total, date_vente) VALUES (?, ?, ?, ?, ?)";

    connection.query(query, [vente.client_id, vente.produit_id, vente.quantite, vente.prix_total, vente.date_vente], (err, results) => {
        if (!err) {
            return res.status(200).json({ message: "Vente ajoutée avec succès." });
        } else {
            return res.status(500).json(err);
        }
    });
});

// Récupérer toutes les ventes
router.get('/getVentes', (req, res) => {
    let query = `
        SELECT v.id, c.nom AS client, p.nom AS produit, v.quantite, v.prix_total, v.date_vente
        FROM vente v
        JOIN client c ON v.client_id = c.id
        JOIN produit p ON v.produit_id = p.id
    `;

    connection.query(query, (err, results) => {
        if (!err) {
            return res.status(200).json(results);
        } else {
            return res.status(500).json(err);
        }
    });
});

// Récupérer une vente par son ID
router.get('/getById/:id', (req, res) => {
    const id = req.params.id;
    let query = `
        SELECT v.id, c.nom AS client, p.nom AS produit, v.quantite, v.prix_total, v.date_vente
        FROM vente v
        JOIN client c ON v.client_id = c.id
        JOIN produit p ON v.produit_id = p.id
        WHERE v.id = ?
    `;

    req.DB.query(query, [id], (err, results) => {
        if (!err) {
            return res.status(200).json(results);
        } else {
            return res.status(500).json(err);
        }
    });
});

// Mettre à jour une vente
router.patch('/update', (req, res) => {
    let vente = req.body;
    let query = "UPDATE vente SET client_id = ?, produit_id = ?, quantite = ?, prix_total = ?, date_vente = ? WHERE id = ?";

    req.DB.query(query, [vente.client_id, vente.produit_id, vente.quantite, vente.prix_total, vente.date_vente, vente.id], (err, results) => {
        if (!err) {
            if (results.affectedRows === 0) {
                return res.status(404).json({ message: "La vente n'a pas été trouvée." });
            }
            return res.status(200).json({ message: "Vente mise à jour avec succès." });
        } else {
            return res.status(500).json({ error: err.message });
        }
    });
});

// Supprimer une vente
router.delete('/delete/:id', (req, res) => {
    let id = req.params.id;
    let query = "DELETE FROM vente WHERE id = ?";

    connection.query(query, [id], (err, results) => {
        if (!err) {
            if (results.affectedRows === 0) {
                return res.status(404).json({ message: "La vente n'a pas été trouvée." });
            }
            return res.status(200).json({ message: "Vente supprimée avec succès." });
        } else {
            return res.status(500).json(err);
        }
    });
});

module.exports = router;