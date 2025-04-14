sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/export/Spreadsheet"
], function (BaseController, JSONModel, MessageToast, MessageBox, Spreadsheet) {
    "use strict";

    return BaseController.extend("sfdintcr1180.controller.MainView", {
        onInit: function () {
            const oModel = new JSONModel({
                lignes: [],
                isFormValid: false,
                isExportEnabled: false,
                utilisateur: "",
                debutTraitement: new Date(),
                finTraitement: null
            });

            if (sap.ushell && sap.ushell.Container) {
                const sUserId = sap.ushell.Container.getUser().getId();
                oModel.setProperty("/utilisateur", sUserId);
            }

            oModel.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
            this.getView().setModel(oModel);
        },

        onValueHelpPointVente: function () {
            const oView = this.getView();
            const oModel = this.getOwnerComponent().getModel(); // OData model déjà configuré
            debugger;
        
            // Crée le SelectDialog uniquement une fois
            if (!this._oPointVenteDialog) {
                this._oPointVenteDialog = new sap.m.SelectDialog({
                    title: "Sélectionner un point de vente",
                    items: {
                        path: "/RetailStoreVHSet",
                        template: new sap.m.StandardListItem({
                            title: "{RETAILSTOREID}"
                        })
                    },
                    confirm: (oEvent) => {
                        const oSelected = oEvent.getParameter("selectedItem");
                        if (oSelected) {
                            const sSelected = oSelected.getTitle();
                            oView.byId("inputPointVente").setValue(sSelected);
                            this.mettreAJourValidation();
                        }
                    },
                    search: function (oEvent) {
                        const sValue = oEvent.getParameter("value");
                        const oFilter = new sap.ui.model.Filter("RETAILSTOREID", sap.ui.model.FilterOperator.Contains, sValue);
                        this.getBinding("items").filter([oFilter]);
                    },
                    liveChange: function (oEvent) {
                        const sValue = oEvent.getParameter("value");
                        const oFilter = new sap.ui.model.Filter("RETAILSTOREID", sap.ui.model.FilterOperator.Contains, sValue);
                        this.getBinding("items").filter([oFilter]);
                    }
                });
        
                this._oPointVenteDialog.setModel(oModel); // Bind le modèle OData
            }
        
            this._oPointVenteDialog.open();
        },

        onChampChange: function () {
            this.mettreAJourValidation();
        },


        validerChampsRequis: function () {
            const oView = this.getView();
            let isValid = true;
        
            // Champs requis
            const inputPointVente = oView.byId("inputPointVente");
            const inputDateVente = oView.byId("inputDateVente");
        
            const pointVente = inputPointVente.getValue();
            const dateVente = inputDateVente.getDateValue();
        
          
        
            // ✅ Validation de la date
            if (!dateVente) {
                inputDateVente.setValueState("Error");
                inputDateVente.setValueStateText("Veuillez saisir une date de vente.");
                isValid = false;
            } else {
                inputDateVente.setValueState("None");
            }
        
            return isValid;
        },
        
        

        mettreAJourValidation: function () {
            const isValid = this.validerChampsRequis();
            this.getView().getModel().setProperty("/isFormValid", isValid);
        },

        onValider: function () {
            const oModel = this.getView().getModel();
            const that = this;

            MessageBox.confirm("Souhaitez-vous valider et envoyer cette transaction à CAR ?", {
                title: "Confirmation de validation",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        oModel.setProperty("/finTraitement", new Date());
                        oModel.setProperty("/isExportEnabled", true);
                        MessageToast.show("Transaction envoyée à CAR avec succès.");
                    }
                }
            });
        },

        onNouveau: function () {
            const that = this;

            MessageBox.confirm("Souhaitez-vous réinitialiser le formulaire ?", {
                title: "Confirmation de réinitialisation",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        const oModel = that.getView().getModel();
                        oModel.setProperty("/lignes", []);
                        oModel.setProperty("/selectedIndices", []);
                        oModel.setProperty("/finTraitement", null);
                        oModel.setProperty("/debutTraitement", new Date());
                        oModel.setProperty("/isFormValid", false);
                        oModel.setProperty("/isExportEnabled", false);

                        ["inputPointVente", "inputDateVente", "inputNumCaisse", "inputRefTicket"].forEach(id => {
                            const oField = that.getView().byId(id);
                            if (oField?.setValue) {
                                oField.setValue("");
                                oField.setValueState("None");
                            }
                        });

                        MessageToast.show("Formulaire réinitialisé.");
                    }
                }
            });
        },

        onQuitter: function () {
            MessageBox.confirm("Souhaitez-vous quitter le formulaire ?", {
                title: "Confirmation de sortie",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        sap.ushell.Container.getService("CrossApplicationNavigation")
                            .toExternal({ target: { shellHash: "#" } });
                    }
                }
            });
        },

        onExporter: function () {
            const that = this;
            MessageBox.confirm("Souhaitez-vous exporter les données au format Excel ?", {
                title: "Confirmation d’export",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        that._exporterExcel();
                    }
                }
            });
        },

        _exporterExcel: function () {
            const oView = this.getView();
            const oModel = oView.getModel();
            const oData = oModel.getData();

            const dateVente = oView.byId("inputDateVente").getDateValue();
            const numCaisse = oView.byId("inputNumCaisse").getValue();
            const numTransaction = oView.byId("inputNumTransaction").getValue();
            const pointVente = oView.byId("inputPointVente").getValue();

            const dd = String(dateVente.getDate()).padStart(2, '0');
            const mm = String(dateVente.getMonth() + 1).padStart(2, '0');
            const yyyy = dateVente.getFullYear();
            const dateFormatted = `${dd}${mm}${yyyy}`;

            const fileName = `Reclassement_${numCaisse}_${numTransaction}_SGM_${pointVente}_${dateFormatted}.xlsx`;

            const formatDateTime = function (oDate) {
                if (!oDate) return "";
                const pad = (n) => (n < 10 ? '0' + n : n);
                return `${pad(oDate.getDate())}/${pad(oDate.getMonth() + 1)}/${oDate.getFullYear()} ${pad(oDate.getHours())}:${pad(oDate.getMinutes())}:${pad(oDate.getSeconds())}`;
            };

            const aRows = oData.lignes.map((ligne) => ({
                pointVente: pointVente,
                numCaisse: numCaisse,
                refTicket: oView.byId("inputRefTicket").getValue(),
                dateVente: `${dd}/${mm}/${yyyy}`,
                numTransaction: numTransaction,
                posteId: ligne.posteId,
                codeTransac: ligne.codeTransac,
                libelleTransac: ligne.libelleTransac,
                montant: ligne.montant,
                utilisateur: oData.utilisateur,
                debutTraitement: formatDateTime(oData.debutTraitement),
                finTraitement: formatDateTime(oData.finTraitement)
            }));

            const aCols = [
                { label: "Point de vente", property: "pointVente" },
                { label: "Numéro de caisse", property: "numCaisse" },
                { label: "Réf. Ticket Initial", property: "refTicket" },
                { label: "Date de vente", property: "dateVente" },
                { label: "Numéro de transaction", property: "numTransaction" },
                { label: "n° de Poste", property: "posteId" },
                { label: "Code Transaction Financière", property: "codeTransac" },
                { label: "Libellé Transaction financière", property: "libelleTransac" },
                { label: "Montants", property: "montant" },
                { label: "Utilisateur", property: "utilisateur" },
                { label: "Début du traitement", property: "debutTraitement" },
                { label: "Fin du traitement", property: "finTraitement" }
            ];

            const oSpreadsheet = new Spreadsheet({
                workbook: { columns: aCols },
                dataSource: aRows,
                fileName: fileName,
                worker: false
            });

            oSpreadsheet.build().finally(() => oSpreadsheet.destroy());
        }
    });
});
