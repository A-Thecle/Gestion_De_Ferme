const express = require("express")
const router = express.Router()
const removeAccents = require('remove-accents'); 

// Route pour calculer les totaux
router.get("/totaux", (req, res) => {
    const sql = `
    SELECT 
        SUM(CASE WHEN LOWER(type_produit) LIKE '%lait%' THEN quantite ELSE 0 END) AS total_lait,
        SUM(CASE WHEN LOWER(type_produit) LIKE '%oeuf%' OR LOWER(type_produit) LIKE '%œuf%' THEN quantite ELSE 0 END) AS total_oeufs,
        SUM(CASE WHEN LOWER(type_produit) LIKE '%viande de porc%' THEN quantite ELSE 0 END) AS total_viandes
    FROM production
`;

    req.DB.query(sql, (error, results) => {
        if (error) {
            console.error("Erreur SQL:", error);
            return res.status(500).json({
                status: false,
                message: "Erreur de la base de données",
                error: error.message
            });
        }

        if(results.length === 0){

            return res.status(200).json({
                status: true,
                message: "Aucune donnée trouvée"
            });
        }

        res.status(200).json({
            status: true,
            data: results[0] // car on récupère une seule ligne avec les 3 totaux
        });
    });
});

router.get("/totalQuantite", (req, res) => {
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);

    // Conversion vers DD/MM/YYYY si nécessaire
    const formatFr = (date) => {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const y = date.getFullYear();
        return `${d}/${m}/${y}`;
    };

    // Pour une colonne VARCHAR en format DD/MM/YYYY dans la base
    const todayFr = formatFr(today);         // ex: 30/04/2025
    const yesterdayFr = formatFr(yesterday); // ex: 29/04/2025

    const query = `
      SELECT 
        date AS jour,
        SUM(quantite) AS total
      FROM production
      WHERE date IN (?, ?)
      GROUP BY date
    `;

    req.DB.query(query, [yesterdayFr, todayFr], (err, results) => {
        if (err) {
            console.error("Erreur lors du calcul :", err);
            return res.status(500).json({ status: false, message: 'Erreur serveur' });
        }

        let totalToday = 0;
        let totalYesterday = 0;

        results.forEach(row => {
            if (row.jour === todayFr) totalToday = row.total;
            else if (row.jour === yesterdayFr) totalYesterday = row.total;
        });

        let pourcentage = 0;
        if (totalYesterday > 0) {
            pourcentage = ((totalToday - totalYesterday) / totalYesterday) * 100;
        }

        res.json({
            status: true,
            data: {
                totalToday,
                totalYesterday,
                pourcentage
            }
        });
    });
});

//Afficher tous les productions
router.get("/liste", (req, res) => {
    const sql = "SELECT * FROM production";
    
    req.DB.query(sql, (error, results) => {
        if (error) {
            // Si une erreur SQL se produit, loggez l'erreur et envoyez une réponse d'erreur avec le statut 500
            console.error("Erreur SQL:", error);
            return res.status(500).json({
                status: false,
                message: "Erreur de la base de données",
                error: error.message
            });
        }
    
        // Vérifiez d'abord s'il y a des résultats
        if(results.length === 0){

            // S'il n'y a pas de données dans la table, envoyez une réponse indiquant qu'il n'y a aucune donnée
            console.log("Il n'y a aucune donnée dans la table production");
            return res.status(200).json({
                status: true,
                message: "Aucune donnée trouvée"
            });
        }
    
        // Si des résultats existent, envoyez-les dans la réponse
        return res.status(200).json({
            status: true,
            data: results
        });
    });
    
})


  

router.get("/recherche", (req, res) => {
    let { type_produit, date } = req.query;
    
    // Construction sécurisée de la requête
    let queryParts = ["SELECT * FROM production WHERE 1=1"];
    let queryParams = [];
    let errors = [];

    // Gestion du type_produit
    if (type_produit && type_produit.trim()) {
        const searchTerm = `%${type_produit.trim().toLowerCase()}%`;
        queryParts.push(`AND (
            LOWER(type_produit) LIKE ? OR
            LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                    type_produit,
                    'à','a'), 'â','a'), 'ä','a'),
                    'é','e'), 'è','e'), 'ê','e'), 'ë','e'),
                    'î','i'), 'ï','i'), 'ô','o')
            ) LIKE ?
        )`);
        queryParams.push(searchTerm, searchTerm);
    }

    // Gestion de la date
    if (date && date.trim()) {
        date = date.trim();
        
        // Format: YYYY
        if (/^\d{4}$/.test(date)) {
            queryParts.push("AND YEAR(date) = ?");
            queryParams.push(date);
        } 
        // Format: MM/YYYY
        else if (/^\d{1,2}\/\d{4}$/.test(date)) {
            const [month, year] = date.split('/');
            queryParts.push("AND YEAR(date) = ? AND MONTH(date) = ?");
            queryParams.push(year, month.padStart(2, '0'));
        }
        // Format: DD/MM/YYYY
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
            const [day, month, year] = date.split('/');
            queryParts.push("AND date = ?");
            queryParams.push(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        } else {
            errors.push("Format de date invalide. Utilisez: 2025, 04/2025 ou 24/04/2025");
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            status: false,
            errors: errors
        });
    }

    const finalQuery = queryParts.join(' ');

    console.log("Requête finale:", finalQuery);
    console.log("Paramètres:", queryParams);

    req.DB.query(finalQuery, queryParams, (error, results) => {
        if (error) {
            console.error("Erreur SQL complète:", {
                query: finalQuery,
                params: queryParams,
                error: error
            });
            return res.status(500).json({
                status: false,
                message: "Erreur de base de données",
                error: error.message
            });
        }

        res.json({
            status: true,
            data: results,
            query: finalQuery,
            params: queryParams
        });
    });
});
  
  
  
  
  

// Ajout production
router.post("/ajout", (req, res) => {
    const { type_produit, quantite, unite, date } = req.body;
    const sql = `INSERT INTO production (type_produit, quantite, unite, date) VALUES (?, ?, ?, ?)`;

    req.DB.query(sql, [type_produit, quantite, unite, date], (error, results) => {
        if (error) {
            console.error("Erreur SQL:", error);
            return res.status(500).json({
                status: false,
                message: "Erreur base de données"
            });
        }

        // Si aucune ligne n'est ajoutée, ne continuez pas le traitement
        if (results.affectedRows === 0) {
            return res.status(200).json({
                status: true,
                message: "Aucune ligne ajoutée"
            });
        }

        // Si tout se passe bien, répondre avec succès
        return res.status(200).json({
            status: true,
            message: "Production ajoutée avec succès"
        });
    });
});



//Route pour récupérer une production par son id
router.get("/:id", (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({
            status: false,
            message: "Identifiant production invalide"
        });
    }

    const sql = "SELECT * FROM production WHERE id = ?";
    req.DB.query(sql, [id], (error, results) => {
        if (error) {
            console.error("Erreur SQL:", error);
            return res.status(500).json({
                status: false,
                message: "Erreur de la base de données",
                error: error.message
            });
        }

        if(results.length === 0){

            return res.status(404).json({
                status: false,
                message: "Aucune production trouvé"
            });
        }

        res.status(200).json({
            status: true,
            data: results[0] // un seul animal
        });
    });
});

//Mise à jour 
router.put("/update/:id", (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({
            status: false,
            message: "Identifiant production invalide"
        });
    }

    const { date, type_produit, quantite, unite} = req.body;

    console.log(`Requête PUT reçue sur /production/update/${req.params.id}`);
    console.log("Données reçues:", req.body);

    // Vérifie que les données sont valides
    if (!date || !type_produit || !quantite || !unite) {
        return res.status(400).json({
            status: false,
            message: "Les champs date, type_produit, quantite, unité  sont requis"
        });
    }

    const sql = "UPDATE production SET date = ?, type_produit = ?, quantite = ?, unite = ? WHERE id = ?";

    req.DB.query(sql, [date,type_produit, quantite, unite, id], (error, result) => {
        if (error) {
            console.error("Erreur SQL:", error);
            return res.status(500).json({
                status: false,
                message: "Échec de mise à jour de production",
                error: error.message
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: false,
                message: "Aucune production trouvée avec cet identifiant"
            });
        }

        res.json({
            status: true,
            message: "Mise à jour réussie",
            data: {
                id,
                date,
                type_produit,
                quantite,
                unite,
              
            }
        });
    });
});

 //suppression 
 router.delete("/suppression/:id", (req, res) => {
    const id = req.params.id;
  
    if(!id || isNaN(id)) {
        return res.status(400).json({
            status: false,
            message: "Identifiant production Invalide"
        });
    }

    
    const sql = "DELETE FROM production WHERE id = ?";
    
    req.DB.query(sql, [id], (error, results) => {
        if(error) {
            console.error("Erreur SQL:", error);
            return res.status(500).json({
                status: false,
                message: "Erreur de base de données",
                error: error.message
            });
        }

        // Vérifie si une ligne a été affectée
        if(results.affectedRows === 0) { //Propriété retourné par Mysql combien de ligne ont été affecté par la requête
            return res.status(404).json({
                status: false,
                message: "Aucun production trouvé avec cet identifiant"
            });
        }

        res.status(200).json({
            status: true,
            message: "Suppression  de production avec succès",
            affectedRows: results.affectedRows
        });
    });
});
module.exports = router


















