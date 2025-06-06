const express = require("express")
const router = express.Router()
const removeAccents = require('remove-accents'); 
// Modifiez votre route /stats pour inclure le total global
router.get("/stats", (req, res) => {
    if (!req.DB) {
        return res.status(500).json({ status: false, message: "DB non connectée" });
    }

    const sql = `
        SELECT 
            produit,
            SUM(quantite) AS total_quantite,
            unite,
            SUM(montant_total) AS chiffre_affaire
        FROM vente
        GROUP BY produit, unite
        ORDER BY chiffre_affaire DESC
    `;

    req.DB.query(sql, (error, results) => {
        if (error) {
            return res.status(500).json({
                status: false,
                message: "Erreur de la base de données",
                error: error.message
            });
        }

        // Calcul du total global
        const totalGlobal = results.reduce((sum, item) => sum + parseFloat(item.chiffre_affaire), 0);

        res.status(200).json({
            status: true,
            data: {
                stats: results,
                totalGlobal: totalGlobal
            }
        });
    });
});


//Afficher tous les productions
router.get("/liste", (req, res) => {
    const sql = "SELECT * FROM vente";
    
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
            console.log("Il n'y a aucune donnée dans la table ventes");
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
    let { produit, date } = req.query;
    
    // Construction sécurisée de la requête
    let queryParts = ["SELECT * FROM vente WHERE 1=1"];
    let queryParams = [];
    let errors = [];

    // Gestion du type_produit
    if (produit && produit.trim()) {
        const searchTerm = `%${produit.trim().toLowerCase()}%`;
        queryParts.push(`AND (
            LOWER(produit) LIKE ? OR
            LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                    produit,
                    'à','a'), 'â','a'), 'ä','a'),
                    'é','e'), 'è','e'), 'ê','e'), 'ë','e'),
                    'î','i'), 'ï','i'), 'ô','o')
            ) LIKE ?
        )`);
        queryParams.push(searchTerm, searchTerm);
    }

    // Gestion de la date
  // Dans router.get("/recherche", ...)
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
    // Format: DD/MM/YYYY - CORRECTION ICI
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
        const [day, month, year] = date.split('/');
        const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        queryParts.push("AND DATE(date) = DATE(?)"); // Utilisation de DATE() pour ignorer l'heure
        queryParams.push(formattedDate);
    } 
    else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        queryParts.push("AND DATE(date) = DATE(?)");
        queryParams.push(date);
    }
    else {
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
    const { produit, quantite, unite, Prix_unitaire, montant_total, date } = req.body;
    
    // 1. Vérifier d'abord le stock disponible
    const checkStockSql = `
        SELECT SUM(quantite) AS stock_disponible 
        FROM production 
        WHERE type_produit = ? AND unite = ?
    `;
    
    req.DB.query(checkStockSql, [produit, unite], (error, stockResults) => {
        if (error) {
            console.error("Erreur SQL:", error);
            return res.status(500).json({
                status: false,
                message: "Erreur de vérification du stock"
            });
        }
        
        const stockDisponible = stockResults[0]?.stock_disponible || 0;
        
        // 2. Si stock insuffisant
        if (stockDisponible < quantite) {
            return res.status(400).json({
                status: false,
                message: `Stock insuffisant. Quantité disponible: ${stockDisponible} ${unite}`,
                stockDisponible: stockDisponible
            });
        }
        
        // 3. Si stock suffisant, procéder à la vente
        const insertSql = `INSERT INTO vente (produit, quantite, unite, Prix_unitaire, montant_total, date) VALUES (?, ?, ?, ?, ?, ?)`;
        
        req.DB.query(insertSql, [produit, quantite, unite, Prix_unitaire, montant_total, date], (error, results) => {
            if (error) {
                console.error("Erreur SQL:", error);
                return res.status(500).json({
                    status: false,
                    message: "Erreur base de données"
                });
            }

            // 4. Mettre à jour le stock en production
            const updateStockSql = `
                UPDATE production 
                SET quantite = quantite - ? 
                WHERE type_produit = ? AND unite = ? 
                ORDER BY date DESC 
                LIMIT 1
            `;
            
            req.DB.query(updateStockSql, [quantite, produit, unite], (updateError) => {
                if (updateError) {
                    console.error("Erreur mise à jour stock:", updateError);
                    // Même si la mise à jour échoue, la vente est déjà enregistrée
                }
                
                return res.status(200).json({
                    status: true,
                    message: "Vente ajoutée avec succès"
                });
            });
        });
    });
});


//Route pour récupérer une production par son id
router.get("/:id", (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({
            status: false,
            message: "Identifiant vente invalide"
        });
    }

    const sql = "SELECT * FROM vente WHERE id = ?";
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
                message: "Aucune vente trouvé"
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
            message: "Identifiant vente invalide"
        });
    }

    const { produit, quantite, unite, Prix_unitaire, montant_total, date} = req.body;

    console.log(`Requête PUT reçue sur /vente/update/${req.params.id}`);
    console.log("Données reçues:", req.body);

    // Vérifie que les données sont valides
    if ( !produit || !quantite || !unite  || !Prix_unitaire || !montant_total || !date) {
        return res.status(400).json({
            status: false,
            message: "Les champs date, type_produit, quantite, unité, prix_unitaire, montant_total  sont requis"
        });
    }

    const sql = "UPDATE vente SET produit = ?, quantite = ?, unite = ?, Prix_unitaire = ?, montant_total = ?, date = ? WHERE id = ?";

    req.DB.query(sql, [produit, quantite, unite, Prix_unitaire, montant_total, date, id], (error, result) => {
        if (error) {
            console.error("Erreur SQL:", error);
            return res.status(500).json({
                status: false,
                message: "Échec de mise à jour de ventes",
                error: error.message
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: false,
                message: "Aucune vente trouvée avec cet identifiant"
            });
        }

        res.json({
            status: true,
            message: "Mise à jour réussie",
            data: {
                id,
                date,
                produit,
                quantite,
                unite,
                Prix_unitaire,
                montant_total
              
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
            message: "Identifiant vente Invalide"
        });
    }

    
    const sql = "DELETE FROM vente WHERE id = ?";
    
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
                message: "Aucun vente trouvé avec cet identifiant"
            });
        }

        res.status(200).json({
            status: true,
            message: "Suppression  de vente avec succès",
            affectedRows: results.affectedRows
        });
    });
});
module.exports = router


















