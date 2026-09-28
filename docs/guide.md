# Guide d'utilisation VSA Ext

Saisissez vos journées dans l'extension, puis reportez tout un mois dans VSA en une seule action.

## Installation

### Chrome ou Edge

1. Ouvrez la fiche [VSA Ext sur le Chrome Web Store](https://chromewebstore.google.com/detail/vsa-ext/ljojgaimkhhjakiibaohlmnhdgjhnhke).
2. Cliquez sur **Ajouter à Chrome**. Dans Edge, activez d'abord **Autoriser les extensions provenant d'autres magasins** dans `edge://extensions`.

### Firefox

Firefox 140 ou plus récent, sur ordinateur. La fiche sur addons.mozilla.org est en cours de validation.

1. Une fois la fiche publiée, cliquez sur **Ajouter à Firefox** : les mises à jour s'installent ensuite toutes seules.
2. Épinglez le bouton : icône en forme de pièce de puzzle, puis **VSA Ext**, puis **Épingler à la barre d'outils**.

L'icône apparaît dans la barre d'outils. Un clic ouvre la page de saisie.

### Adresse de votre VSA

1. Ouvrez la page de saisie de l'extension (clic sur l'icône).
2. Collez l'adresse de votre page de saisie VSA dans **VSA timesheet URL**, telle qu'elle apparaît dans la barre d'adresse.
3. Cliquez sur **Save & grant access** et acceptez la demande d'accès de votre navigateur.
4. Le bouton **Open** à droite ouvre ensuite votre page de saisie VSA dans un nouvel onglet. Il reste grisé tant qu'aucune adresse n'est enregistrée.

À faire une seule fois. L'extension ne connaît aucune adresse à l'avance : sans cette étape, elle ne peut atteindre aucun site.

Les réglages sont regroupés sous **Settings**, en haut de la page. Le panneau reste ouvert tant que l'adresse n'est pas enregistrée, puis se replie à l'ouverture suivante : un clic sur **Settings** le rouvre.

### Réglages facultatifs

| Réglage | Rôle |
| --- | --- |
| **VSA language** | Suit par défaut la langue de votre VSA. Laissez-le sur *Detect automatically* ; ne le forcez que si la détection se trompe. |
| **Send notes to VSA as day comments** | Décochée par défaut. Cochée, le report inscrit chaque note comme commentaire du jour dans VSA ; décochée, vos notes ne partent jamais vers VSA. |
| **CRA sheet tab** | Le nom exact de votre onglet dans le classeur du CRA d'équipe (par exemple `Camille DUPONT`). Empêche de coller votre mois dans l'onglet d'un collègue. |
| **CRA workbook URL** | Le lien du classeur du CRA d'équipe. Active le bouton **Open** pour l'ouvrir. |

## Listes déroulantes lisibles

Sur la page de saisie VSA, les listes d'activité et de projet sont trop étroites pour être lues.

- Cliquez sur l'une d'elles : elle s'élargit le temps de la consultation.
- Elle reprend sa taille dès que vous choisissez, cliquez ailleurs ou appuyez sur `Échap`.
- Rien à configurer.

## Saisie parallèle

### Première utilisation : clients et projets

1. Ouvrez la page de saisie VSA et laissez-la ouverte.
2. Cliquez sur l'icône de l'extension pour ouvrir la page de saisie.
3. Cliquez sur **Sync clients & projects from VSA**.

L'extension parcourt chaque client et relève ses projets, en affichant la progression (`Syncing 3/7: MERIDIAN SANTE`). Comptez une minute environ. À refaire uniquement lorsque vos projets changent dans VSA.

Une page VSA sans aucune ligne convient : l'extension en ajoute une avec le bouton **+**. Cette ligne reste vide, n'est pas enregistrée, et sert à l'injection suivante.

> Vos clients et projets sont enregistrés sur cet ordinateur et survivent aux redémarrages. Les activités internes (Formation, Alternance Ecole, Intercontrat...) sont chargées aussi, sans projet. L'absence reste à saisir directement dans VSA.

### Saisie au quotidien

- **Add row** ajoute une ligne, datée du lendemain de la précédente et reprenant le même client et le même projet : une semaine se saisit en quelques clics.
- Choisissez le **client**, puis le **projet**. La liste des projets ne propose que ceux du client retenu.
- Pour une journée d'école, de formation ou d'intercontrat, choisissez l'activité dans le groupe **Internal activities**, en bas de la liste des clients : le projet reste vide.
- **Days** avance par huitièmes : `0,125` vaut une heure, `0,5` une demi-journée, `1` une journée complète.
- **Note** n'est transmise à VSA que si vous cochez **Send notes to VSA as day comments** : elle devient alors le commentaire du jour dans VSA. Elle devient aussi la colonne **Tâche** du CRA d'équipe quand vous envoyez votre mois : écrivez-la pour vos collègues.
- Les lignes d'un même jour sont regroupées sous un bandeau qui affiche la date, le total du jour sur 1 et son état : **complete** (journée pleine), **missing** (il manque du temps) ou **over** (plus d'une journée). Changer la date d'une ligne la range sous le bon jour.
- **<** et **>** changent de mois.

Tout est enregistré au fil de la frappe. Le pied de tableau affiche votre total, le nombre de jours complets, partiels ou en trop, et le nombre de lignes prêtes.

### Saisie sur une plage de dates

Pour le même temps sur le même projet plusieurs jours de suite (un projet suivi toute la semaine, une formation...) :

1. Cliquez sur **Add range**. Le formulaire reprend le client, le projet et les journées de la dernière ligne du mois.
2. Choisissez le **client**, le **projet**, les **Days** par jour et, si besoin, une **Note**.
3. Indiquez **From** et **To**.
4. Lisez l'aperçu : les jours retenus, les jours écartés, et les jours qui dépasseraient une journée avec les lignes déjà saisies.
5. Cliquez sur **Add N rows** : une ligne est créée par jour, modifiable ensuite comme toute autre ligne.

- Les week-ends et les jours fériés sont écartés par défaut. Cochez **Include weekends** ou **Include bank holidays** pour les garder.
- Le formulaire reste ouvert pour enchaîner une autre plage, par exemple deux demi-journées sur deux projets la même semaine. **Cancel** le referme.
- Une plage peut déborder sur le mois suivant : la ligne d'état indique combien de lignes y sont parties.
- Une plage est limitée à 62 jours.

### Jours fériés

Le panneau **Public holidays**, sous les réglages, liste les jours écartés d'une plage. Il affiche les dates de l'année du mois affiché.

- Les 11 jours fériés nationaux français sont cochés par défaut. Décochez-en un s'il est travaillé chez vous (lundi de Pentecôte en journée de solidarité, par exemple).
- Vendredi saint et Saint-Étienne (Alsace-Moselle) sont proposés, décochés.
- **Custom days off** ajoute vos propres jours : pont, fermeture d'entreprise, jour férié local. Une date et un libellé facultatif, puis **Add**.
- **Reset to France defaults**, **Reset to UK defaults** et **Reset to USA defaults** remplacent la liste par celle du pays choisi et suppriment les jours ajoutés. La France reste la liste par défaut ; le titre du panneau indique le pays retenu.
- **Royaume-Uni** : les jours fériés d'Angleterre et du pays de Galles sont cochés ; ceux d'Écosse et d'Irlande du Nord sont proposés, décochés. Un jour férié tombant un week-end est remplacé par le jour ouvré suivant (*substitute day*). Les jours exceptionnels (événements royaux) s'ajoutent en jours personnalisés.
- **États-Unis** : les 11 jours fériés fédéraux sont cochés, le lendemain de Thanksgiving est proposé, décoché. Un jour férié tombant un samedi est chômé le vendredi, un dimanche le lundi (*observed*).

### Report dans VSA

1. Ouvrez la page de saisie VSA, sur le bon mois.
2. Dans la page de l'extension, cliquez sur **Inject this month into VSA**.
3. Vérifiez la grille dans VSA, puis cliquez vous-même sur **Save**.

> **L'extension n'enregistre jamais votre feuille de temps.** Elle se contente de remplir le formulaire, exactement comme vous le feriez à la main. Rien n'est transmis à VSA tant que vous n'avez pas cliqué sur Save. Si le résultat vous semble faux, rechargez la page VSA : rien n'est conservé.

Le report se déroule en deux temps, visibles dans la ligne d'état :

1. L'extension crée les lignes et sélectionne client et projet.
2. Elle inscrit les journées.

Une ligne dont le projet n'a pas pu être chargé ne reçoit aucune journée, et la ligne d'état la signale.

## CRA d'équipe

Le classeur `CRA-Equipe.xlsx` de l'équipe reçoit vos journées avant leur report dans VSA, pour validation. L'envoi se fait par copier-coller : aucun compte, aucune connexion.

1. Dans la page de l'extension, sur le bon mois, cliquez sur **Copy for CRA sheet**. Le mois est copié dans le presse-papiers ; la ligne d'état indique le nombre de lignes et d'heures.
2. Ouvrez le classeur dans Excel (navigateur ou application) et allez sur **votre** onglet.
3. Cliquez sur la cellule jaune **I23** (« Coller ici le bloc VSA Ext ») et collez (`Ctrl+V`).
4. Cliquez sur le bouton **Importer VSA Ext** juste au-dessus.
5. Lisez le résultat en **I24** : `✔ 12 ligne(s) importée(s) pour 2026-09 (96 h)…`.

### Règles d'envoi

- **Ce qui part** : les lignes complètes du mois affiché (date, projet, journées), avec la note dans la colonne Tâche.
- **Heures entières** : les journées deviennent des heures entières (`0,125` = 1 h). Une valeur qui ne tombe pas sur une heure entière bloque la copie : corrigez-la d'abord.
- **Renvoi du même mois** : remplace les lignes que l'extension avait déjà déposées (colonne **Source** = `VSA Ext`) et ne touche jamais aux lignes tapées à la main dans Excel.
- **Projet inconnu du classeur** : bloque tout l'import. I24 liste ce qu'il faut ajouter dans l'onglet **Admin** (client et numéro `BS-…`). Complétez le référentiel, puis recliquez sur le bouton : le bloc est encore dans I23.
- **Prévention de ce refus** : **Copy projects for Admin** copie les projets du mois affiché sous forme de lignes prêtes à coller dans le tableau de l'onglet Admin (client, numéro, nom du projet, Facturable, Oui). Envoyez-les à la personne qui tient le référentiel avant votre premier envoi du mois.
- **Activités internes** : elles partent dans le bloc avec leur nom comme client et comme projet, sans numéro `BS-…`. Le classeur les reconnaît si l'onglet Admin a une ligne à ce nom de client. **Copy projects for Admin** les ignore.

## Boutons

| Bouton | Rôle |
| --- | --- |
| **Add row** | Ajoute une ligne au mois affiché. |
| **Add range** | Ouvre le formulaire de saisie sur une plage de dates : une ligne par jour, hors week-ends et jours fériés sauf si vous les incluez. |
| **Export JSON** | Sauvegarde complète : tous les mois, votre liste de clients et vos jours fériés. C'est le fichier que relit **Import JSON**. |
| **Export CSV** | Le mois affiché sous forme de tableur, pour consultation ou partage. Non réimportable. |
| **Copy for CRA sheet** | Copie le mois affiché dans le presse-papiers, prêt à coller dans la cellule I23 de votre onglet du CRA d'équipe. |
| **Copy projects for Admin** | Copie les projets du mois affiché (client, numéro, nom du projet) en lignes prêtes à coller dans le référentiel de l'onglet Admin du CRA d'équipe. |
| **Import JSON** | Restaure une sauvegarde. Journées, clients et jours fériés sont restaurés indépendamment : ce qu'un fichier ne contient pas reste intact. |
| **Sync clients & projects from VSA** | Recharge vos clients et leurs projets. Sans risque à répéter : l'opération ne fait qu'ajouter ou mettre à jour. |
| **Reset to France / UK / USA defaults** | Remplace les jours fériés par la liste du pays et supprime vos jours ajoutés. |
| **Reset catalog** | Vide la liste des clients pour la reconstruire proprement. Vos journées saisies ne sont pas touchées. |
| **Inject this month into VSA** | Remplit la grille VSA avec les lignes du mois. N'enregistre pas. |
| **Open** | Ouvre dans un nouvel onglet l'adresse enregistrée à côté : votre page de saisie VSA, ou le classeur CRA. Grisé tant qu'aucune adresse n'est enregistrée. |

## En cas de problème

### « Open the VSA timesheet page first »

La page de saisie VSA n'est ouverte dans aucun onglet. Ouvrez-la et réessayez.

### « Could not reach the VSA page »

Rechargez l'onglet VSA, puis réessayez. Cela se produit généralement après une mise à jour de l'extension.

### Liste des projets vide après le choix d'un client

Les projets de ce client n'ont pas été chargés. Relancez **Sync clients & projects from VSA** avec la page VSA ouverte. Répéter une synchronisation est sans risque : un client dont la lecture échoue conserve les projets qu'il avait déjà.

### Lignes en échec au report

La ligne d'état nomme chacune d'elles. En général, le projet n'existe plus chez ce client : resynchronisez, puis resélectionnez le projet. Aucune journée n'est inscrite sur une ligne en échec, le reste du mois est donc bien reporté.

### « Nothing complete to inject »

Chaque ligne doit comporter un projet (ou une activité interne) et un nombre de journées supérieur à zéro. Les lignes incomplètes restent dans la page de saisie mais sont ignorées au moment du report.

### « Cannot copy: … not a whole number of hours »

Une ligne du mois a un nombre de journées qui ne correspond pas à des heures entières (par exemple `0,3`). Le CRA d'équipe compte en heures entières : ramenez la valeur à un multiple de `0,125`, puis recopiez.

### « ✖ Import refusé » en I24 du CRA d'équipe

Rien n'a été écrit. Le message nomme chaque problème :

- projet absent du référentiel Admin : ajoutez-le, avec son numéro `BS-…`
- bloc collé dans le mauvais onglet
- bloc abîmé au collage : recopiez depuis l'extension et collez dans la seule cellule I23

Corrigez, puis recliquez sur **Importer VSA Ext**.

> Vos données ne résident que dans ce navigateur, sur cet ordinateur. Désinstaller l'extension les efface : utilisez **Export JSON** si vous souhaitez une sauvegarde.
