# CRA d'équipe — importer les journées de VSA Ext (à installer une seule fois)

Deux scripts Office pour le classeur `CRA-Equipe.xlsx`. Ils complètent les six boutons déjà en place (voir le `README-boutons.md` livré avec le classeur) et suivent la même mécanique : scripts dans OneDrive, associés au classeur, boutons posés à la main.

## Le principe

1. Dans l'extension VSA Ext, **Copy for CRA sheet** copie le mois affiché sous forme d'une seule ligne de JSON.
2. Dans le classeur, sur **son** onglet, on colle ce bloc dans la cellule jaune **I23** puis on clique **⬇ Importer VSA Ext**.
3. Le script vérifie le bloc contre le référentiel de l'onglet Admin et écrit les lignes dans le tableau de l'onglet. Résultat en **I24**.

Trois règles :

- **Marqueur.** Les lignes écrites par le script portent `VSA Ext` dans une colonne **Source**, ajoutée en fin de tableau. Renvoyer le même mois remplace ces lignes-là et ne touche jamais aux lignes tapées à la main.
- **Tout ou rien.** Un projet inconnu du référentiel, une date hors du mois, des heures non entières : l'import est refusé en bloc, rien n'est écrit, I24 liste les problèmes, le bloc reste en I23. On complète l'onglet Admin, on reclique.
- **Rapprochement des projets.** Le numéro `BS-xx-xxxxxx` du libellé VSA est cherché dans la colonne **Numéro** du référentiel. À défaut, le client (sans casse ni accents) doit n'avoir qu'un seul projet actif compatible. Sinon le message dit quoi ajouter dans Admin.

Les heures sont recalculées côté classeur avec `HeuresParJour` (onglet Admin) : `0,125` jour = 1 h.

## Fichiers

| Fichier | Rôle |
|---|---|
| `dist/CRA - Initialiser import VSA Ext.osts` | Prépare les onglets : colonne Source, cellules I23 / I24. À exécuter une fois, sans risque à relancer. |
| `dist/CRA - Importer VSA Ext.osts` | L'import. Un bouton par onglet personne et sur `_Modele`. |
| `dist/*.ts` | Le même code, à coller dans l'éditeur de scripts si le dépôt du `.osts` ne convient pas. |
| `logic.ts` | Le cœur, sans appel Excel, testé par `node --test` à la racine du dépôt. |
| `main-import.ts`, `main-init.ts` | La colle Excel de chaque script. |
| `build.mjs` | Assemble `dist/` à partir des trois fichiers précédents. Ne modifiez jamais `dist/` à la main. |

## Installation (chemins de l'interface française)

1. Ouvrez `CRA-Equipe.xlsx` dans **Excel pour le web**. Si vous n'avez jamais créé de script, ruban **Automatiser** → **Nouveau script** une fois : Excel crée le dossier `Documents\Scripts Office\` dans votre OneDrive (constaté en recette : le lien « Afficher plus de scripts » n'apparaît qu'ensuite).
2. Copiez les deux fichiers `.osts` de `dist/` dans ce dossier `OneDrive\Documents\Scripts Office\`. Le nom du fichier est le nom du script. Excel ne liste que les scripts qu'il connaît : si les deux fichiers n'apparaissent pas dans **Scripts récents**, créez deux scripts vides avec **Nouveau script**, remplacez le contenu de leurs `.osts` par celui des nôtres (même enveloppe JSON), puis renommez-les depuis l'éditeur (clic sur le titre).
3. Ruban **Automatiser** → **Afficher les scripts** → **Scripts récents** → ouvrez `CRA - Initialiser import VSA Ext`.
4. Cliquez **Exécuter**. Le volet affiche un rapport par onglet (`Camille DUPONT : colonne Source ajoutée`…). Vérifiez sur un onglet : une colonne **Source** en I27, la cellule jaune **I23** « ← Coller ici le bloc VSA Ext », et la ligne 22 un peu plus haute (24 pt) pour loger le bouton. Affichez `_Modele` (clic droit sur un onglet → Afficher) pour vérifier qu'il l'a aussi, puis remasquez-le.
5. Ouvrez de la même façon `CRA - Importer VSA Ext`. Dans sa fiche, activez **Associer au classeur** : c'est ce qui permet aux collègues de l'exécuter et débloque le bouton.
6. Sur **chaque onglet personne** : cliquez la cellule **I22**, puis **Ajouter un bouton à la feuille de calcul**. **F5** : le bouton apparaît, libellé « Exécuter CRA - Importer VSA Ext ».
7. Clic droit sur le bouton → **Modifier le texte** → `⬇ Importer VSA Ext`. Retaillez-le à la largeur des boutons voisins (I → M), comme « ⟳ Cette semaine » juste au-dessus.
8. Faites de même sur `_Modele` (afficher, poser, remasquer) : toute personne créée ensuite par « ➕ Ajouter la personne » hérite du bouton, de la colonne et des cellules.
9. Rappel du `README-boutons.md` du classeur : après un remplacement du fichier, le premier clic sur un bouton affiche « Initialisation des boutons d'exécution » et ne fait rien ; le deuxième fonctionne.
10. Testez (section suivante).

Si l'onglet **Automatiser** est absent du ruban, les Office Scripts sont désactivés pour le tenant : passez par l'IT.

## Vérifier que tout marche

Sur une **copie** du classeur d'abord, jamais sur le fichier de l'équipe.

1. Dans l'extension, saisissez deux lignes d'un mois sur un projet connu du référentiel, puis **Copy for CRA sheet**.
2. Sur votre onglet : I23 → coller → **⬇ Importer VSA Ext**. Attendu en I24 : `✔ 2 ligne(s) importée(s) pour 2026-09 (… h) · 0 remplacée(s) · le …`, deux lignes dans le tableau avec `VSA Ext` en Source, Jours / Mois / Semaine calculés, la vue de la semaine à jour.
3. Modifiez une journée dans l'extension, recopiez, recollez, réimportez. Attendu : toujours deux lignes, `2 remplacée(s)`, aucune ligne en double.
4. Ajoutez une ligne à la main dans le tableau (Source vide), réimportez : elle reste.
5. Dans l'extension, saisissez un projet qui n'existe pas dans Admin, recopiez, réimportez. Attendu : `✖ Import refusé (1 problème(s)) : Projet inconnu « … » : ajoutez-le dans Admin (…)`, aucune ligne modifiée, le bloc toujours en I23. Ajoutez le projet dans Admin, recliquez : accepté.
6. Cliquez **➕ Ligne du jour** : il doit toujours fonctionner avec la colonne Source en plus (voir le risque ci-dessous).
7. Onglet **Synthèse** : les heures importées apparaissent dans la colonne de la personne.

## Risque connu

Le script « CRA - Ajouter une ligne pour aujourdhui » livré avec le classeur peut supposer un tableau à 8 colonnes. Après l'initialisation il y en a 9. Si le bouton **➕ Ligne du jour** échoue, ouvrez ce script et remplacez toute liste de 8 valeurs par une liste de 9 (ou faites-lui écrire les cellules par en-tête). Les autres boutons ne touchent pas au tableau.

## Remplacer ou déplacer le classeur

Les scripts vivent dans OneDrive et suivent le classeur ; les boutons sont des formes dans le fichier. Après un déménagement du fichier, rouvrez chaque script et vérifiez que **Associer au classeur** est toujours actif. Avant de remplacer le fichier par une version locale, fermez tous les onglets navigateur qui l'affichent (règle rappelée dans le `README-boutons.md`).

## Le format `.osts`

Un `.osts` est un JSON : `{"version":"0.3.0","body":"<le code>","description":"…","parameterInfo":"…","apiInfo":"…"}`. `build.mjs` le produit à partir de `logic.ts` et de la colle. Si Excel refuse le fichier, créez un **Nouveau script** dans l'éditeur, collez le contenu du `.ts` de `dist/` du même nom, renommez-le à l'identique et enregistrez : le résultat est le même.

## Contrat d'échange (version 1)

```json
{"v":1,"source":"vsa-ext","month":"2026-09","person":"Camille DUPONT",
 "rows":[{"date":"2026-09-01","client":"NORTHWIND TRADING","project":"BS-99-000086 [Projet Principal]","days":1,"task":"Atelier interfaces"}]}
```

`person` vide = pas de contrôle d'onglet. `days` est la valeur source ; les heures sont recalculées côté classeur. Une version différente est refusée : extension et scripts se mettent à jour ensemble.
