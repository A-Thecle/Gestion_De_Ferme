const express = require('express');

const router = express.Router();

// Ajouter un produit
router.post('/ajoutProduit', (req, res) => {
    let produit = req.body;
    let query = "INSERT INTO produit (nom, description, prix) VALUES (?, ?, ?)";

    req.DB.query(query, [produit.nom, produit.description, produit.prix], (err, results) => {
        if (!err) {
            return res.status(200).json({ message: "Produit ajouté avec succès." });
        } else {
            return res.status(500).json(err);
        }
    });
});

// Récupérer tous les produits
router.get('/getProduits', (req, res) => {
    let query = "SELECT * FROM produit";

    connection.query(query, (err, results) => {
        if (!err) {
            return res.status(200).json(results);
        } else {
            return res.status(500).json(err);
        }
    });
});

// Récupérer un produit par son ID
router.get('/getById/:id', (req, res) => {
    const id = req.params.id;
    let query = "SELECT id, nom, description, prix FROM produit WHERE id = ?";

    req.DB.query(query, [id], (err, results) => {
        if (!err) {
            return res.status(200).json(results);
        } else {
            return res.status(500).json(err);
        }
    });
});

// Mettre à jour un produit
router.patch('/update', (req, res) => {
    let produit = req.body;
    let query = "UPDATE produit SET nom = ?, description = ?, prix = ? WHERE id = ?";

    req.DB.query(query, [produit.nom, produit.description, produit.prix, produit.id], (err, results) => {
        if (!err) {
            if (results.affectedRows === 0) {
                return res.status(404).json({ message: "Le produit n'a pas été trouvé." });
            }
            return res.status(200).json({ message: "Produit mis à jour avec succès." });
        } else {
            return res.status(500).json({ error: err.message });
        }
    });
});

// Supprimer un produit
router.delete('/delete/:id', (req, res) => {
    let id = req.params.id;
    let query = "DELETE FROM produit WHERE id = ?";

    Request.DB.query(query, [id], (err, results) => {
        if (!err) {
            if (results.affectedRows === 0) {
                return res.status(404).json({ message: "Le produit n'a pas été trouvé." });
            }
            return res.status(200).json({ message: "Produit supprimé avec succès." });
        } else {
            return res.status(500).json(err);
        }
    });
});

module.exports = router;
