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
                user: "",
                debutTraitement: new Date(),
                finTraitement: null
            });

            sap.ui.require(["sap/ushell/Container"], function () {
                sap.ushell.Container
                    .getServiceAsync("UserInfo")
                    .then(function (oUserInfo) {
                        // ► API ≥ UI5 1.75 :
                        oModel.setProperty("/user", oUserInfo.getId())
                        // ► Par sécurité pour les versions plus anciennes :
                        // console.log("User ID :", oUserInfo.getUser().getId());
                    })
                    .catch(function (err) {
                        //console.error("UserInfo service KO :", err);
                    });
            });

            // if (sap.ushell && sap.ushell.Container) {
            //     const sUserId = sap.ushell.Container.getUser().getId();
            //     oModel.setProperty("/user", sUserId);
            // }

            oModel.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
            this.getView().setModel(oModel);
            this.loadTenderTypes();
        },

        //*****************************************************    Value Help      ******************************************************************************************** 

        onValueHelpRetailStore: function () {
            const oView = this.getView();
            const oModel = this.getOwnerComponent().getModel();

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
                            oView.byId("inputPointV7ente").setValue(sSelected);
                            this.updateValidationState();
                        }
                    },
                    search: function (oEvent) {
                        debugger;
                        const sValue = oEvent.getParameter("value");
                        const oFilter = new sap.ui.model.Filter("RETAILSTOREID", sap.ui.model.FilterOperator.Contains, sValue);
                        oEvent.getSource().getBinding("items").filter([oFilter]);
                    },
                    liveChange: function (oEvent) {
                        const sValue = oEvent.getParameter("value");
                        const oFilter = new sap.ui.model.Filter("RETAILSTOREID", sap.ui.model.FilterOperator.Contains, sValue);
                        oEvent.getSource().getBinding("items").filter([oFilter]);
                    }

                });

                this._oPointVenteDialog.setModel(oModel); 
            }

            this._oPointVenteDialog.open();
        },

        //*****************************************************   Load Tenders    ******************************************************************************************** 

        loadTenderTypes: function () {
            const oView = this.getView();
            const oModel = oView.getModel();
            const oODataModel = this.getOwnerComponent().getModel();

            oODataModel.read("/TenderTypeVHSet", {
                success: function (oData) {
                    const aLignes = oData.results.map(item => ({
                        codeTransac: item.TENDERTYPECODE,
                        libelleTransac: item.DESCRIPTION,
                        montant: "0.00"
                    }));

                    oModel.setProperty("/lignes", aLignes);
                },
                error: function () {
                    MessageToast.show("Erreur lors du chargement des moyens de paiement.");
                }
            });
        },




        //*****************************************************    Field validation    ******************************************************************************************** 

        validateRequiredFields: function () {
            const oView = this.getView();
            const oModel = oView.getModel();
            let isValid = true;

            
            const inputPointVente = oView.byId("inputPointVente");
            const pointVente = inputPointVente.getValue();
            if (!pointVente) {
                inputPointVente.setValueState("Error");
                inputPointVente.setValueStateText("Veuillez sélectionner un point de vente.");
                isValid = false;
            } else {
                inputPointVente.setValueState("None");
            }

            
            const inputDateVente = oView.byId("inputDateVente");
            const dateVente = inputDateVente.getDateValue();
            if (!dateVente) {
                inputDateVente.setValueState("Error");
                inputDateVente.setValueStateText("Veuillez saisir une date de vente.");
                isValid = false;
            } else {
                inputDateVente.setValueState("None");
            }

            // 3. Vérification au moins un montant > 0
            const aLignes = oModel.getProperty("/lignes") || [];
            const bMontantSaisi = aLignes.some(item => parseFloat(item.montant) > 0);
            if (!bMontantSaisi) {
                isValid = false;

            }

            return isValid;
        },



        updateValidationState: function () {
            const isValid = this.validateRequiredFields();
            this.getView().getModel().setProperty("/isFormValid", isValid);
        },

        onFieldChange: function () {
            this.updateValidationState();
        },


        //*****************************************************    Submit Button      ******************************************************************************************** 
        
        onSubmit: function () {
            const oModel = this.getView().getModel();
            const that = this;

            MessageBox.confirm("Souhaitez-vous valider et envoyer cette transaction à CAR ?", {
                title: "Confirmation de validation",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        that.generateTransactionNumber();
                        oModel.setProperty("/finTraitement", new Date());
                        that.sendToBackend();
                    }
                }
            });
        },


        generateTransactionNumber: function () {
            const oView = this.getView();
            const oModel = oView.getModel();

            const retailStore = oView.byId("inputPointVente").getValue();
            const workstationId = oView.byId("inputNumCaisse").getValue();
            const dateVente = oView.byId("inputDateVente").getDateValue();

            if (!retailStore || !workstationId || !dateVente) {
                return;
            }

            const right4Retail = retailStore.slice(-4);
            const year = String(dateVente.getFullYear()).slice(-2);

            const startOfYear = new Date(dateVente.getFullYear(), 0, 0);
            const diff = dateVente - startOfYear;
            const oneDay = 1000 * 60 * 60 * 24;
            const dayOfYear = Math.floor(diff / oneDay);

            const transNumber = `${right4Retail}${workstationId}${year}${dayOfYear.toString().padStart(3, '0')}`;
            oView.byId("inputNumTransaction").setValue(transNumber);
        },

        sendToBackend: function () {
            const oView = this.getView();
            const oModel = oView.getModel();
            const oODataModel = this.getOwnerComponent().getModel(); // Modèle OData

            const debut = oModel.getProperty("/debutTraitement");
            const fin = oModel.getProperty("/finTraitement");

            const payload = {
                RETAILSTOREID: oView.byId("inputPointVente").getValue(),
                BUSINESSDAYDATE: this._formatDate(oView.byId("inputDateVente").getDateValue()),
                TRANSNUMBER: oView.byId("inputNumTransaction").getValue(),
                TRANSTYPECODE: oView.byId("inputTypeTransaction")?.getValue() || "",
                WORKSTATIONID: oView.byId("inputNumCaisse").getValue(),
                TRANSCURRENCY: oView.byId("inputDevise")?.getValue() || "",
                PROCESSUSER: oModel.getProperty("/user"),
                BEGINTIMESTAMP: this._formatTimestamp(debut),
                ENDTIMESTAMP: this._formatTimestamp(fin),
                HDRTOITEMNAV: oModel.getProperty("/lignes").map(item => ({
                    TENDERTYPECODE: item.codeTransac,
                    TENDERACTUALAMOUNT: item.montant
                })),
                ToMessages: []
            };

            oODataModel.create("/IdocHeaderSet", payload, {
                success: function (oData) {
                    if (oData && oData.ToMessages && oData.ToMessages.results) {
                        var aMessages = oData.ToMessages.results;
                        var errorMessage = "";
                        var successMessage = "";
                        var hasError = false;

                        aMessages.forEach(function (oMessage) {
                            if (oMessage.type === 'E') {
                                errorMessage += oMessage.message + "\n";
                                hasError = true;
                            } else {
                                successMessage += oMessage.message;
                            }
                        });

                        if (hasError) {
                            MessageBox.error(errorMessage || "Erreur inconnue lors de l'envoi.");
                        } else {
                            MessageBox.success(successMessage);
                            oModel.setProperty("/isFormValid", false);
                            oModel.setProperty("/isExportEnabled", true);

                        }
                    } else {
                        MessageToast.show("Formulaire envoyé, mais aucun message de retour.");
                    }
                },
                error: function () {
                    MessageBox.error("Erreur lors de l’envoi du formulaire.");
                }
            });

        },

        _formatDate: function (oDate) {
            if (!oDate) return "";
            const yyyy = oDate.getFullYear();
            const mm = String(oDate.getMonth() + 1).padStart(2, '0');
            const dd = String(oDate.getDate()).padStart(2, '0');
            return `${yyyy}${mm}${dd}`;
        },

        _formatTimestamp: function (oDate) {
            if (!oDate) return "";
            const yyyy = oDate.getFullYear();
            const mm = String(oDate.getMonth() + 1).padStart(2, '0');
            const dd = String(oDate.getDate()).padStart(2, '0');
            const hh = String(oDate.getHours()).padStart(2, '0');
            const mi = String(oDate.getMinutes()).padStart(2, '0');
            const ss = String(oDate.getSeconds()).padStart(2, '0');
            return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
        },


        //*****************************************************    Reset Button    ******************************************************************************************** 
        onResetForm: function () {
            const that = this;

            MessageBox.confirm("Souhaitez-vous réinitialiser le formulaire ?", {
                title: "Confirmation de réinitialisation",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        const oModel = that.getView().getModel();
                        const aLignes = oModel.getProperty("/lignes") || [];
                        const aReset = aLignes.map(ligne => ({
                            ...ligne,
                            montant: "0.00"
                        }));
                        oModel.setProperty("/lignes", aReset);
                        oModel.setProperty("/selectedIndices", []);
                        oModel.setProperty("/finTraitement", null);
                        oModel.setProperty("/debutTraitement", new Date());
                        oModel.setProperty("/isFormValid", false);
                        oModel.setProperty("/isExportEnabled", false);

                        ["inputPointVente", "inputDateVente", "inputNumTransaction"].forEach(id => {
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



        //*****************************************************    Exit Button      ******************************************************************************************** 

        onExit: function () {
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




        //*****************************************************    Export Button     ******************************************************************************************** 

        onExportToExcel: function () {
            const that = this;
            MessageBox.confirm("Souhaitez-vous exporter les données au format Excel ?", {
                title: "Confirmation d’export",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        that._buildExcelFile();
                    }
                }
            });
        },

        _buildExcelFile: function () {
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

            const fileName = `Export_Cloture_SGM_${pointVente}_${dateFormatted}.xlsx`;

            const formatDateTime = function (oDate) {
                if (!oDate) return "";
                const pad = (n) => (n < 10 ? '0' + n : n);
                return `${pad(oDate.getDate())}/${pad(oDate.getMonth() + 1)}/${oDate.getFullYear()} ${pad(oDate.getHours())}:${pad(oDate.getMinutes())}:${pad(oDate.getSeconds())}`;
            };

            const aRows = oData.lignes.map((ligne) => ({
                pointVente: pointVente,
                numCaisse: numCaisse,
                dateVente: `${dd}/${mm}/${yyyy}`,
                numTransaction: numTransaction,
                codeTransac: ligne.codeTransac,
                libelleTransac: ligne.libelleTransac,
                montant: ligne.montant,
                user: oData.user,
                debutTraitement: formatDateTime(oData.debutTraitement),
                finTraitement: formatDateTime(oData.finTraitement)
            }));

            const aCols = [
                { label: "Point de vente", property: "pointVente" },
                { label: "Numéro de caisse", property: "numCaisse" },
                { label: "Date de vente", property: "dateVente" },
                { label: "Numéro de transaction", property: "numTransaction" },
                { label: "Code du moyen de paiement", property: "codeTransac" },
                { label: "Libellé Moyen de Paiement", property: "libelleTransac" },
                { label: "Montants Réels", property: "montant" },
                { label: "User", property: "user" },
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
