const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const bodyParser = require('body-parser');

const app = express();

// Middlewares
app.use(cors({ origin: 'http://localhost:4200' }));
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 1. D'abord créer la connexion DB
const DB = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'fermes',
    port: 3306,
    timezone: 'Z'
});

// 2. Ensuite connecter et configurer le middleware
DB.connect(function (error) {
    if (error) {
        console.log("Erreur de la connexion à la base de données");
        console.log(error);
    } else {
        console.log("Connexion réussie avec la base de données Fermes");
        
        // Maintenant que DB est défini, on peut l'ajouter aux requêtes
        app.use((req, res, next) => {
            req.DB = DB;
            next();
        });

        // 3. Importer les routes APRÈS que DB est disponible
        const vaccinationRoutes = require("./routes/vaccination");
        const productionRoutes = require("./routes/production");
        const venteRoutes = require("./routes/vente");
        const stock_aliments = require("./routes/stock_aliments");
        const ration = require("./routes/ration");
        const aliment = require("./routes/aliment");
     

        app.use("/vaccination", vaccinationRoutes);
        app.use("/production", productionRoutes);
        app.use("/vente", venteRoutes);
        app.use("/stockAliments", stock_aliments);
        app.use("/ration", ration);
        app.use("/aliment", aliment);
    

        // Démarrer le serveur seulement une fois tout configuré
        app.listen(5555, () => {
            console.log("Démarrage du serveur");
        });
    }
});

// ... le reste de vos routes ...



//Routes pour les stats 
app.get("/animal/stats", (req, res) => {
    console.log("Route /animal/stats appelée");
    const sql = `
        SELECT type, COUNT(*) AS total
        FROM animaux
        GROUP BY type
    `;

    DB.query(sql, (error, results) => {
        if (error) {
            console.error("Erreur SQL:", error);
            return res.status(500).json({
                status: false,
                message: "Erreur de la base de données",
                error: error.message
            });
        }

        res.status(200).json({
            status: true,
            data: results
        });
    });
});

//Afficher tous les animaux
app.get("/animaux", (req, res) => {
    const sql = "SELECT * FROM animaux";
    
    DB.query(sql, (error, results) => {
      if(error) {
        console.error("Erreur SQL:", error);
        return res.status(500).json({
          status: false,
          message: "Erreur base de données"
        });
      }
      if(results.length === 0){
        
        console.log("il y a aucune donnée dans la table animaux")
        res.status(200).json({
            status : true, 
            message : "Aucun donnée trouvé"
        })
      }
      res.status(200).json({
        status: true,
        data: results 
      });
    });
})


//Recherche
app.get("/animal/recherche", (req, res) => {
    const { type, statut } = req.query;
    let sql = "SELECT * FROM animaux WHERE 1=1";
    let params = [];
    if (type) {
        sql += " AND type = ?"; 
        params.push(type); 
    }
    if (statut) {
        sql += " AND statut = ?"; 
        params.push(statut); 
    }
  

    
    DB.query(sql, params, (error, results) => {
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
                message: "Aucun reproduction trouvé avec les critères spécifiés."
            });
        }
         res.status(200).json({
            status: true,
            data: results
        });
    });
});

//Ajout animal
app.post("/animal/ajout", (req, res) => {
    try {
        const { type, race, dateNaissance, sexe, statut } = req.body;
        
        // Validation stricte du format MySQL
        if (!dateNaissance.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return res.status(400).json({
                status: false,
                message: "Le format de date doit être YYYY-MM-DD"
            });
        }

        const sql = "INSERT INTO animaux SET ?";
        DB.query(sql, { type, race, dateNaissance, sexe, statut }, (error, results) => {
            if (error) {
                console.error("Erreur SQL:", error);
                return res.status(500).json({
                    status: false,
                    message: "Erreur serveur",
                    error: error.message
                });
            }

            res.json({
                status: true,
                message: "Animal ajouté avec succès",
                data: { id: results.insertId }
            });
        });
    } catch (error) {
        console.error("Erreur:", error);
        res.status(500).json({
            status: false,
            message: "Erreur serveur",
            error: error.message
        });
    }
});
// Route pour récupérer un animal par son ID
app.get("/animal/:animalId", (req, res) => {
    const animalId = parseInt(req.params.animalId);
    if (isNaN(animalId)) {
        return res.status(400).json({
            status: false,
            message: "Identifiant animal invalide"
        });
    }

    const sql = "SELECT * FROM animaux WHERE animalId = ?";
    DB.query(sql, [animalId], (error, results) => {
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
                message: "Aucun animal trouvé"
            });
        }

        res.status(200).json({
            status: true,
            data: results[0] // un seul animal
        });
    });
});

// Mise à jour de l'animal
app.put("/animal/update/:animalId", (req, res) => {
    const animalId = parseInt(req.params.animalId);
    if (isNaN(animalId)) {
        return res.status(400).json({ 
            status: false, 
            message: "Identifiant animal invalide" 
        });
    }

    const { type, race, dateNaissance, sexe, statut } = req.body;

    console.log(`Requête PUT reçue sur /animal/update/${req.params.animalId}`);
    console.log("Données reçues:", req.body);
    
   

    const sql = "UPDATE animaux SET type = ?, race = ?, dateNaissance = ?, sexe = ?, statut = ? WHERE animalId = ?";
    DB.query(sql, [type, race, dateNaissance, sexe, statut, animalId], (error, result) => {
        if (error) {
            console.error("Erreur SQL:", error);
            return res.status(500).json({ 
                status: false, 
                message: "Échec de mise à jour",
                error: error.message 
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                status: false, 
                message: "Aucun animal trouvé avec cet identifiant" 
            });
        }

        res.json({ 
            status: true, 
            message: "Mise à jour réussie",
            data: {
                animalId,
                type,
                race,
                dateNaissance,
                sexe,
                statut
            }
        });
    });
});

 //suppression 
 app.delete("/animal/suppression/:animalId", (req, res) => {
    const animalId = req.params.animalId;
  
    if(!animalId || isNaN(animalId)) {
        return res.status(400).json({
            status: false,
            message: "Identifiant animal Invalide"
        });
    }

    
    const sql = "DELETE FROM animaux WHERE animalId = ?";
    
    DB.query(sql, [animalId], (error, results) => {
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
                message: "Aucun animal trouvé avec cet identifiant"
            });
        }

        res.status(200).json({
            status: true,
            message: "Suppression  de l'animal réussie",
            affectedRows: results.affectedRows
        });
    });
});















