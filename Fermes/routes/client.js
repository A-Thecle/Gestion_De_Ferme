const express = require ('express');
const router = express.Router();


router.post('/ajoutClient', (req, res) => {
    let client = req.body;
    let query = "INSERT INTO client (nom, adresse, email, telephone) VALUES (?, ?, ?, ?)";
    
    req.DB.query(query, [client.nom, client.adresse, client.email, client.telephone], (err, results) => {
        if (!err) {
            return res.status(200).json({ message: "Client ajouté avec succès." });
        } else {
            return res.status(500).json(err);
        }
    });
});

// Récupérer tous les clients
router.get('/getClients', (req, res) => {
    let query = "SELECT * FROM client";
    
    req.DB.query(query, (err, results) => {
        if (!err) {
            return res.status(200).json(results);
        } else {
            return res.status(500).json(err);
        }
    });
});

// Récupérer un client par son ID
router.get('/getById/:id', (req, res) => {
    const id = req.params.id;
    let query = "SELECT id, nom, adresse, email, telephone FROM client WHERE id = ?";
    
    req.DB.query(query, [id], (err, results) => {
        if (!err) {
            return res.status(200).json(results);
        } else {
            return res.status(500).json(err);
        }
    });
});

// Mettre à jour un client
router.patch('/update', (req, res) => {
    let client = req.body;
    let query = "UPDATE client SET nom = ?, adresse = ?, email = ?, telephone = ? WHERE id = ?";
    
    req.DB.query(query, [client.nom, client.adresse, client.email, client.telephone, client.id], (err, results) => {
        if (!err) {
            if (results.affectedRows === 0) {
                return res.status(404).json({ message: "Le client n'a pas été trouvé." });
            }
            return res.status(200).json({ message: "Client mis à jour avec succès." });
        } else {
            return res.status(500).json({ error: err.message });
        }
    });
});

// Supprimer un client
router.delete('/delete/:id', (req, res) => {
    let id = req.params.id;
    let query = "DELETE FROM client WHERE id = ?";
    
    req.DB.query(query, [id], (err, results) => {
        if (!err) {
            if (results.affectedRows === 0) {
                return res.status(404).json({ message: "Le client n'a pas été trouvé." });
            }
            return res.status(200).json({ message: "Client supprimé avec succès." });
        } else {
            return res.status(500).json(err);
        }
    });
});

module.exports = router;