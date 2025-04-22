const express = require("express")
const router = express.Router()
const removeAccents = require('remove-accents'); 


//Afficher tous les Reproductions
router.get("/liste", (req, res) => {
    const sql = "SELECT * FROM vaccination";
    
    req.DB.query(sql, (error, results) => {
      if(error) {
        console.error("Erreur SQL:", error);
        return res.status(500).json({
          status: false,
          message: "Erreur base de données"
        });
      }
      if(results.lenght === 0){
        console.log("il y a aucune donnée dans la table reproduction")
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


//Recherche avec typeAnimal et année
//Recherche avec typeAnimal et année
router.get("/recherche", (req, res) => {
    let { typeAnimal, annee } = req.query;
  
    let sql = "SELECT * FROM vaccination WHERE 1=1";
    let params = [];
  
    if (typeAnimal && typeAnimal.trim() !== '') {
      typeAnimal = removeAccents(typeAnimal.trim().toLowerCase());
      sql += " AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(typeAnimal, 'à','a'),'â','a'),'ä','a'),'é','e'),'è','e'),'ê','e'),'ë','e'),'î','i'),'ï','i'),'ô','o')) LIKE ?";
      params.push(`%${typeAnimal}%`);
    }
  
    if (annee && annee !== '') {
      const anneeNum = parseInt(annee, 10);
      if (!isNaN(anneeNum) && anneeNum >= 2000 && anneeNum <= 2030) {
        // Modification importante ici - vérification du format de date
        sql += ` AND (
          (dateDernierVaccin IS NOT NULL AND YEAR(dateDernierVaccin) = ?) 
          OR 
          (dateVaccinSuivant IS NOT NULL AND YEAR(dateVaccinSuivant) = ?)
        )`;
        params.push(anneeNum, anneeNum);
      }
    }
  
    console.log("Requête SQL:", sql); // Log pour débogage
    console.log("Paramètres:", params); // Log pour débogage
  
    req.DB.query(sql, params, (error, results) => {
      if (error) {
        console.error("Erreur SQL:", error);
        return res.status(500).json({
          status: false,
          message: "Erreur de la base de données",
          error: error.message
        });
      }
  
      console.log("Résultats:", results); // Log pour débogage
      res.status(200).json({
        status: true,
        data: results
      });
    });
});


//Ajout vaccin
router.post("/ajout", (req, res)=>{
    let dateDernierVaccin = new Date(req.body.dateDernierVaccin);
    
    let dateVaccinSuivant;
    if (req.body.dateVaccinSuivant) {
        dateVaccinSuivant = new Date(req.body.dateVaccinSuivant);
    } else {
        // Calcul automatique : +6 mois
        dateVaccinSuivant = new Date(dateDernierVaccin);
        dateVaccinSuivant.setMonth(dateVaccinSuivant.getMonth() + 6);
    }

    let details = {
        typeAnimal: req.body.typeAnimal,
        dateDernierVaccin: dateDernierVaccin,
        dateVaccinSuivant: dateVaccinSuivant
    }

    let sql = "INSERT INTO vaccination SET ?";
    req.DB.query(sql, details, (error)=>{
        if(error){
            console.error("Erreur SQL:", error);
            res.send({status: false, message:"Ajout de vaccination échoué"})
        } else {
            res.send({status: true, message : "Vaccination ajouté avec succès "})
        }
    })
});

//Route pour récupérer un vaccin par son id
router.get("/:idVaccin", (req, res) => {
    const idVaccin = parseInt(req.params.idVaccin);
    if (isNaN(idVaccin)) {
        return res.status(400).json({
            status: false,
            message: "Identifiant vaccination invalide"
        });
    }

    const sql = "SELECT * FROM vaccination WHERE idVaccin = ?";
    req.DB.query(sql, [idVaccin], (error, results) => {
        if (error) {
            console.error("Erreur SQL:", error);
            return res.status(500).json({
                status: false,
                message: "Erreur de la base de données",
                error: error.message
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                status: false,
                message: "Aucun vaccination trouvé"
            });
        }

        res.status(200).json({
            status: true,
            data: results[0] // un seul animal
        });
    });
});

//Mise à jour 
router.put("/update/:idVaccin", (req, res) => {
    const idVaccin = parseInt(req.params.idVaccin);
    if (isNaN(idVaccin)) {
        return res.status(400).json({
            status: false,
            message: "Identifiant vaccination invalide"
        });
    }

    const { typeAnimal, dateDernierVaccin, dateVaccinSuivant} = req.body;

    console.log(`Requête PUT reçue sur /vaccination/update/${req.params.idVaccin}`);
    console.log("Données reçues:", req.body);

    // Vérifie que les données sont valides
    if (!typeAnimal || !dateDernierVaccin) {
        return res.status(400).json({
            status: false,
            message: "Les champs typeAnimal, dateDernierVaccin  sont requis"
        });
    }

    const sql = "UPDATE vaccination SET typeAnimal = ?, dateDernierVaccin = ?, dateVaccinSuivant = ? WHERE idVaccin = ?";

    req.DB.query(sql, [typeAnimal, dateDernierVaccin, dateVaccinSuivant, idVaccin], (error, result) => {
        if (error) {
            console.error("Erreur SQL:", error);
            return res.status(500).json({
                status: false,
                message: "Échec de mise à jour de vaccination",
                error: error.message
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: false,
                message: "Aucune vaccination trouvée avec cet identifiant"
            });
        }

        res.json({
            status: true,
            message: "Mise à jour réussie",
            data: {
                idVaccin,
                typeAnimal,
                dateDernierVaccin,
                dateVaccinSuivant,
              
            }
        });
    });
});

 //suppression 
 router.delete("/suppression/:idVaccin", (req, res) => {
    const idVaccin = req.params.idVaccin;
  
    if(!idVaccin || isNaN(idVaccin)) {
        return res.status(400).json({
            status: false,
            message: "Identifiant vaccination Invalide"
        });
    }

    
    const sql = "DELETE FROM vaccination WHERE idVaccin = ?";
    
    req.DB.query(sql, [idVaccin], (error, results) => {
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
                message: "Aucun vaccination trouvé avec cet identifiant"
            });
        }

        res.status(200).json({
            status: true,
            message: "Suppression  de vaccination avec succès",
            affectedRows: results.affectedRows
        });
    });
});
module.exports = router

















