const express = require('express');

const router = express.Router();
router.get('/SearchRations', (req, res) => {
    try {
        const { aliment_nom, date } = req.query;

        let query = `
            SELECT 
                ra.id,
                ra.quantite_consommee,
                ra.date_consommation,
                an.type AS type_animal,
                a.nom AS aliment_nom,
                a.unite,
                a.prix_unitaire,
                ROUND((ra.quantite_consommee * a.prix_unitaire), 2) AS montant_total
            FROM rationalimentaire ra
            JOIN aliments a ON ra.aliment_id = a.id
            LEFT JOIN animaux an ON ra.type_animal_id = an.animalId
            WHERE 1=1
        `;
        const params = [];

        if (aliment_nom) {
            query += ` AND LOWER(a.nom) LIKE LOWER(?)`; // Modification ici
            params.push(`%${aliment_nom}%`);
        }

        if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
            query += ` AND DATE(ra.date_consommation) = ?`;
            params.push(date);
        }

        console.log("Requête SQL:", query);
        console.log("Paramètres:", params);

        req.DB.query(query, params, (err, results) => {
            if (err) {
                console.error("Erreur SQL:", err);
                return res.status(500).json({ 
                    success: false,
                    message: "Erreur de base de données",
                    error: err.message
                });
            }

            return res.json({
                success: true,
                data: results
            });
        });

    } catch (error) {
        console.error("Erreur:", error);
        return res.status(500).json({ 
            success: false,
            message: "Erreur interne du serveur"
        });
    }
});
router.get('/debug-aliments', (req, res) => {
    const query = `
        SELECT 
            a.id AS aliment_id,
            a.nom AS aliment_nom,
            COUNT(ra.id) AS nb_rations,
            MIN(ra.date_consommation) AS premiere_ration,
            MAX(ra.date_consommation) AS derniere_ration
        FROM aliments a
        LEFT JOIN rationalimentaire ra ON a.id = ra.aliment_id
        GROUP BY a.id
        ORDER BY a.nom
    `;
    
    req.DB.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Ajouter une ration alimentaire (version ultra-simplifiée)
router.post('/ajoutRation', (req, res) => {
    const ration = req.body;
    const today = new Date().toISOString().split('T')[0]; // Date du jour au format YYYY-MM-DD

    // Vérification du stock disponible
    req.DB.query(
        `SELECT SUM(quantite) as stock FROM stock_aliments WHERE aliment_id = ?`, 
        [ration.aliment_id],
        (err, stockResults) => {
            if (err) return res.status(500).json(err);
            
            const stock = stockResults[0].stock || 0;
            if (stock < ration.quantite_consommee) {
                return res.status(400).json({
                    message: `Stock insuffisant (${stock} disponible, ${ration.quantite_consommee} demandé)`
                });
            }

            // Vérification de l'existence de l'animal dans la table animaux via animalId
            req.DB.query(
                `SELECT * FROM animaux WHERE animalId = ?`, 
                [ration.type_animal_id], // Cette fois-ci on compare avec l'animalId
                (err, animalResults) => {
                    if (err) return res.status(500).json(err);
                    if (animalResults.length === 0) {
                        return res.status(400).json({ message: "Type d'animal non trouvé" });
                    }

                    // Insertion de la ration dans la table ration_alimentaire
                   req.DB.query(
                        `INSERT INTO rationalimentaire SET ?`, 
                        {
                            type_animal_id: ration.type_animal_id, // animalId comme référence dans ration_alimentaire
                            aliment_id: ration.aliment_id,
                            date_consommation: today,
                            quantite_consommee: ration.quantite_consommee,
                            montant_total: 0
                        },
                        (err, result) => {
                            if (err) return res.status(500).json(err);
                            
                            const rationId = result.insertId;

                            // Sortie de stock
                            req.DB.query(
                                `INSERT INTO stock_aliments SET ?`,
                                {
                                    aliment_id: ration.aliment_id,
                                    quantite: -ration.quantite_consommee,
                                    date_ajout: today,
                                    operation_type: 'sortie',
                                    motif: `Ration ${rationId}`
                                },
                                (err) => {
                                    if (err) return res.status(500).json(err);
                                    
                                    // Mise à jour du montant total de la ration
                                   req.DB.query(
                                        `UPDATE rationalimentaire ra
                                         JOIN aliments a ON ra.aliment_id = a.id
                                         SET ra.montant_total = ra.quantite_consommee * a.prix_unitaire
                                         WHERE ra.id = ?`,
                                        [rationId],
                                        (err) => {
                                            if (err) return res.status(500).json(err);
                                            res.json({ success: true, rationId });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});


// Obtenir toutes les rations
router.get('/getRations', (req, res) => {
    let query = `
        SELECT ra.*, an.type AS type_animal, a.nom AS aliment_nom, a.unite, a.prix_unitaire,
               (ra.quantite_consommee * a.prix_unitaire) AS montant_total
        FROM rationalimentaire ra
        JOIN animaux an ON ra.type_animal_id = an.animalId
        JOIN aliments a ON ra.aliment_id = a.id
    `;
    
   req.DB.query(query, (err, results) => {
        if (!err) {
            return res.status(200).json(results);
        } else {
            return res.status(500).json(err);
        }
    });
});


// Obtenir une ration par son ID
router.get('/getById/:id', (req, res) => {
    const id = req.params.id;
    let query = `
        SELECT ra.*, ta.nom AS type_animal, a.nom AS aliment_nom 
        FROM rationalimentaire ra
        JOIN type_animaux ta ON ra.type_animal_id = ta.id
        JOIN aliments a ON ra.aliment_id = a.id
        WHERE ra.id = ?
    `;
    req.DB.query(query, [id], (err, results) => {
        if (!err) {
            if (results.length === 0) {
                return res.status(404).json({ message: "Ration non trouvée" });
            }
            return res.status(200).json(results[0]);
        } else {
            return res.status(500).json(err);
        }
    });
});


// Mettre à jour une ration
router.patch('/update/:id', (req, res) => {
    console.log('Requête reçue:', req.method, req.url, req.body);
    const ration = req.body;
    ration.id = req.params.id;

    req.DB.beginTransaction(err => {
        if (err) return res.status(500).json(err);

        req.DB.query(
            `SELECT aliment_id, quantite_consommee, date_consommation FROM rationalimentaire WHERE id = ?`,
            [ration.id],
            (err, results) => {
                if (err || results.length === 0) {
                    return req.DB.rollback(() =>
                        res.status(404).json({ message: "Ration non trouvée" })
                    );
                }

                const ancienne = results[0];
                const difference = ration.quantite_consommee - ancienne.quantite_consommee;

                const verifierStockSiBesoin = (callback) => {
                    if (ration.aliment_id !== ancienne.aliment_id || difference > 0) {
                       req.DB.query(
                            `SELECT SUM(quantite) as stock FROM stock_aliments WHERE aliment_id = ?`,
                            [ration.aliment_id],
                            (err, stockRes) => {
                                if (err) return req.DB.rollback(() => res.status(500).json(err));
                                const stock = stockRes[0].stock || 0;

                                if (difference > 0 && stock < difference) {
                                    return req.DB.rollback(() =>
                                        res.status(400).json({
                                            message: `Stock insuffisant (Stock: ${stock}, Supplément demandé: ${difference})`
                                        })
                                    );
                                }
                                callback();
                            }
                        );
                    } else {
                        callback();
                    }
                };

                verifierStockSiBesoin(() => {
                    req.DB.query(
                        `UPDATE rationalimentaire 
                         SET type_animal_id = ?, aliment_id = ?, quantite_consommee = ? 
                         WHERE id = ?`,
                        [
                            ration.type_animal_id,
                            ration.aliment_id,
                            ration.quantite_consommee,
                            ration.id
                        ],
                        (err) => {
                            if (err) return req.DB.rollback(() => res.status(500).json(err));

                            const majStock = () => {
                                if (ration.aliment_id !== ancienne.aliment_id || difference !== 0) {
                                    req.DB.query(
                                        `INSERT INTO stock_aliments 
                                         (aliment_id, quantite, date_ajout, operation_type, motif) 
                                         VALUES (?, ?, ?, 'entree', ?)`,
                                        [
                                            ancienne.aliment_id,
                                            ancienne.quantite_consommee,
                                            ancienne.date_consommation,
                                            `Annulation ration`
                                        ],
                                        (err) => {
                                            if (err) return req.DB.rollback(() => res.status(500).json(err));

                                           req.DB.query(
                                                `INSERT INTO stock_aliments 
                                                 (aliment_id, quantite, date_ajout, operation_type, motif) 
                                                 VALUES (?, ?, ?, 'sortie', ?)`,
                                                [
                                                    ration.aliment_id,
                                                    -ration.quantite_consommee,
                                                    ancienne.date_consommation,
                                                    `Consommation ration`
                                                ],
                                                (err) => {
                                                    if (err) return req.DB.rollback(() => res.status(500).json(err));
                                                    miseAJourMontant();
                                                }
                                            );
                                        }
                                    );
                                } else {
                                    miseAJourMontant();
                                }
                            };

                            const miseAJourMontant = () => {
                                req.DB.query(
                                    `UPDATE rationalimentaire ra
                                     JOIN aliments a ON ra.aliment_id = a.id
                                     SET ra.montant_total = ra.quantite_consommee * a.prix_unitaire
                                     WHERE ra.id = ?`,
                                    [ration.id],
                                    (err) => {
                                        if (err) return req.DB.rollback(() => res.status(500).json(err));

                                        req.DB.commit(err => {
                                            if (err) return req.DB.rollback(() => res.status(500).json(err));
                                            res.status(200).json({ message: "Ration mise à jour avec succès" });
                                        });
                                    }
                                );
                            };

                            majStock();
                        }
                    );
                });
            }
        );
    });
});

// Obtenir l'historique des mouvements de stock avec filtres
// Dans votre backend (Node.js)
router.get('/historique', (req, res) => {
    let query = `
        SELECT 
            sa.id,
            a.nom as aliment,
            a.unite,
            sa.quantite,
            sa.operation_type,
            sa.motif,
            sa.date_ajout
        FROM 
            stock_aliments sa
        JOIN 
            aliments a ON sa.aliment_id = a.id
        WHERE 1=1
    `;
    
    const params = [];

    // Filtre par nom d'aliment (insensible à la casse)
    if (req.query.nom_aliment) {  // Changé de 'nom' à 'nom_aliment'
        query += ' AND LOWER(a.nom) LIKE ?';
        params.push('%' + req.query.nom_aliment.toLowerCase() + '%');
    }

    // Filtre par date complète
    if (req.query.date) {
        query += ' AND DATE(sa.date_ajout) = ?';
        params.push(req.query.date);
    }

    // Filtre par année seule
    if (req.query.annee) {
        query += ' AND YEAR(sa.date_ajout) = ?';
        params.push(req.query.annee);
    }

    query += ' ORDER BY sa.date_ajout DESC';

    req.DB.query(query, params, (err, results) => {
        if (err) {
            return res.status(500).json(err);
        }
        res.status(200).json(results);
    });
});


// Supprimer une ration
router.delete('/delete/:id', (req, res) => {
    const id = req.params.id;
    
    req.DB.beginTransaction(err => {
        if (err) return res.status(500).json(err);

        // 1. Récupérer les infos de la ration
        req.DB.query(
            `SELECT aliment_id, quantite_consommee, date_consommation 
             FROM rationalimentaire 
             WHERE id = ?`,
            [id],
            (err, results) => {
                if (err) return req.DB.rollback(() => res.status(500).json(err));
                if (results.length === 0) return req.DB.rollback(() => res.status(404).json({message: "Ration non trouvée"}));

                const ration = results[0];

                // 2. Corrigez ici : 'entree' au lieu de 'entrée' et réduisez la longueur du motif
                req.DB.query(
                    `INSERT INTO stock_aliments 
                     (aliment_id, quantite, date_ajout, operation_type, motif) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        ration.aliment_id,
                        ration.quantite_consommee,
                        ration.date_consommation,
                        'entree', // <= Modification clé ici (en anglais sans accent)
                        `Annul ration ${id}` // Texte plus court
                    ],
                    (err) => {
                        if (err) return req.DB.rollback(() => res.status(500).json(err));

                        // 3. Suppression de la ration
                        req.DB.query(
                            `DELETE FROM rationalimentaire WHERE id = ?`,
                            [id],
                            (err, results) => {
                                if (err) return req.DB.rollback(() => res.status(500).json(err));
                                if (results.affectedRows === 0) return req.DB.rollback(() => res.status(404).json({message: "Ration non trouvée"}));

                                req.DB.commit(err => {
                                    if (err) return req.DB.rollback(() => res.status(500).json(err));
                                    res.json({ success: true, message: "Ration supprimée" });
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});





module.exports = router;