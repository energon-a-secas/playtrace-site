/*!
 * Neorgon Auth Kit: Clerk's own form in Spanish (es-MX). neorgon-auth.js imports this
 * only while <html lang> is Spanish. Vendored by authkit.py locale; never edit it by hand.
 *
 * @clerk/localizations 4.24.4, dist/es-MX.mjs, sha256 4c7eefaa07c49edcb2a499c2c471e3f7c4b84aacc6237224c2752c42cab4c3f8
 * This header is added and the closing sourceMappingURL line removed; nothing else differs.
 *
 * MIT License
 *
 * Copyright (c) 2022 Clerk, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
//#region src/es-MX.ts
const esMX = {
	locale: "es-MX",
	actionBlocked: {
		subtitle: void 0,
		title: void 0,
		traceIdLabel: void 0
	},
	apiKeys: {
		action__add: void 0,
		action__search: void 0,
		copySecret: {
			formButtonPrimary__copyAndClose: "Copiar y cerrar",
			formHint: "Por razones de seguridad, no podrás verlo de nuevo más tarde.",
			formTitle: "Copia tu clave API \"{{name}}\" ahora"
		},
		createdAndExpirationStatus__expiresOn: void 0,
		createdAndExpirationStatus__never: void 0,
		detailsTitle__emptyRow: void 0,
		formButtonPrimary__add: void 0,
		formFieldCaption__expiration__expiresOn: void 0,
		formFieldCaption__expiration__never: void 0,
		formFieldOption__expiration__180d: void 0,
		formFieldOption__expiration__1d: void 0,
		formFieldOption__expiration__1y: void 0,
		formFieldOption__expiration__30d: void 0,
		formFieldOption__expiration__60d: void 0,
		formFieldOption__expiration__7d: void 0,
		formFieldOption__expiration__90d: void 0,
		formFieldOption__expiration__never: void 0,
		formHint: void 0,
		formTitle: void 0,
		lastUsed__days: void 0,
		lastUsed__hours: void 0,
		lastUsed__minutes: void 0,
		lastUsed__months: void 0,
		lastUsed__seconds: void 0,
		lastUsed__years: void 0,
		menuAction__revoke: void 0,
		revokeConfirmation: {
			confirmationText: void 0,
			formButtonPrimary__revoke: void 0,
			formHint: void 0,
			formTitle: void 0,
			inputLabel: void 0
		},
		tableHeader__actions: void 0,
		tableHeader__lastUsed: void 0,
		tableHeader__name: void 0
	},
	backButton: "Atrás",
	badge__activePlan: void 0,
	badge__banned: void 0,
	badge__canceledEndsAt: void 0,
	badge__currentPlan: "Plan actual",
	badge__default: "Por defecto",
	badge__deprovisioned: void 0,
	badge__endsAt: "Termina {{ date | shortDate('en-US') }}",
	badge__expired: "Caducado",
	badge__freeTrial: void 0,
	badge__otherImpersonatorDevice: "Otro dispositivo de imitación",
	badge__pastDueAt: void 0,
	badge__pastDuePlan: void 0,
	badge__primary: "Primario",
	badge__renewsAt: void 0,
	badge__requiresAction: "Requiere acción",
	badge__startsAt: "Empieza {{ date | shortDate('en-US') }}",
	badge__thisDevice: "Este dispositivo",
	badge__trialEndsAt: void 0,
	badge__unverified: "No confirmado",
	badge__upcomingPlan: "Próximo plan",
	badge__userDevice: "Dispositivo de usuario",
	badge__you: "Usted",
	billing: {
		accountCredit: void 0,
		addPaymentMethod__label: void 0,
		alwaysFree: void 0,
		annually: void 0,
		availableFeatures: void 0,
		billedAnnually: "Facturado anualmente",
		billedAnnuallyOnly: void 0,
		billedMonthly: void 0,
		billedMonthlyOnly: void 0,
		cancelFreeTrial: "Cancelar prueba gratuita",
		cancelFreeTrialAccessUntil: "Tu prueba gratuita permanecerá activa hasta el {{ date | longDate('es-MX') }}. Después de eso, perderás el acceso a las funciones de prueba y no se te cobrará.",
		cancelFreeTrialTitle: "¿Cancelar prueba gratuita del plan {{plan}}?",
		cancelSubscription: "Cancelar suscripción",
		cancelSubscriptionAccessUntil: void 0,
		cancelSubscriptionNoCharge: void 0,
		cancelSubscriptionPastDue: void 0,
		cancelSubscriptionTitle: void 0,
		cannotSubscribeMonthly: void 0,
		cannotSubscribeUnrecoverable: void 0,
		checkout: {
			addPromoCode: void 0,
			applyPromoCode: void 0,
			description__paymentSuccessful: void 0,
			description__subscriptionSuccessful: void 0,
			discount: void 0,
			downgradeNotice: void 0,
			emailForm: {
				subtitle: void 0,
				title: void 0
			},
			lineItems: {
				title__freeTrialEndsAt: void 0,
				title__paymentMethod: "Método de pago",
				title__statementId: "Número de factura",
				title__subscriptionBegins: "La suscripción empieza",
				title__totalPaid: "Total pagado"
			},
			pastDueNotice: void 0,
			perMonth: void 0,
			promoCodePlaceholder: void 0,
			removePromoCode: void 0,
			title: void 0,
			title__paymentSuccessful: "¡Pago exitoso!",
			title__subscriptionSuccessful: "¡Éxito!",
			title__trialSuccess: void 0,
			totalDueAfterTrial: void 0,
			totalDuePerPeriod: void 0
		},
		credit: void 0,
		creditRemainder: void 0,
		defaultFreePlanActive: void 0,
		discountAmount: void 0,
		discountCyclesRemaining: void 0,
		discountDuration: void 0,
		free: "Gratis",
		getStarted: "Empezar",
		highlightedPlanBadge: void 0,
		keepFreeTrial: void 0,
		keepSubscription: "Mantener suscripción",
		manage: "Gestionar",
		manageSubscription: "Gestionar suscripción",
		month: "Mes",
		monthAbbreviation: void 0,
		monthPerUnit: void 0,
		monthly: void 0,
		months: void 0,
		pastDue: void 0,
		pay: void 0,
		payerCreditRemainder: void 0,
		paymentMethod: {
			applePayDescription: {
				annual: void 0,
				monthly: void 0
			},
			dev: {
				anyNumbers: void 0,
				cardNumber: void 0,
				cvcZip: void 0,
				developmentMode: void 0,
				expirationDate: void 0,
				testCardInfo: void 0
			}
		},
		paymentMethods__label: void 0,
		pricingTable: {
			billingCycle: void 0,
			included: void 0,
			seatCost: {
				additionalSeats: void 0,
				freeUpToSeats: void 0,
				includedSeats: void 0,
				perSeat: void 0,
				tooltip: {
					additionalSeatsEach: void 0,
					firstSeatsIncludedInPlan: void 0,
					freeForUpToSeats: void 0
				},
				unlimitedSeats: void 0,
				upToSeats: void 0
			}
		},
		proratedDiscount: void 0,
		prorationCredit: void 0,
		reSubscribe: "Re-suscribirse",
		seatBreakdownIncludedPlural: void 0,
		seatBreakdownIncludedSingular: void 0,
		seatBreakdownPlural: void 0,
		seatBreakdownSingular: void 0,
		seats: void 0,
		seatsWithLimit: void 0,
		seeAllFeatures: void 0,
		startFreeTrial: void 0,
		startFreeTrial__days: void 0,
		subscribe: void 0,
		subscriptionDetails: {
			beginsOn: void 0,
			currentBillingCycle: void 0,
			endsOn: void 0,
			firstPaymentAmount: void 0,
			firstPaymentOn: void 0,
			nextPaymentAmount: void 0,
			nextPaymentOn: void 0,
			pastDueAt: void 0,
			renewsAt: void 0,
			subscribedOn: void 0,
			title: void 0,
			trialEndsOn: void 0,
			trialStartedOn: void 0
		},
		subtotal: void 0,
		subtotalRenewal: void 0,
		switchPlan: "Cambiar a este plan",
		switchToAnnual: void 0,
		switchToAnnualWithAnnualPrice: void 0,
		switchToMonthly: void 0,
		switchToMonthlyWithPrice: void 0,
		totalDue: void 0,
		totalDuePerPeriod: void 0,
		totalDueToday: void 0,
		viewFeatures: void 0,
		viewPayment: void 0,
		year: void 0,
		yearAbbreviation: void 0,
		yearPerUnit: void 0,
		years: void 0
	},
	configureDirectorySync: {
		attributeMappingStep: {
			columns: {
				clerkAttribute: void 0,
				directoryAttribute: void 0
			},
			subtitle: void 0,
			title: void 0
		},
		configureStep: {
			actionLabel__generateToken: void 0,
			actionLabel__replaceKey: void 0,
			actionLabel__retry: void 0,
			actionLabel__uploadKey: void 0,
			badge__credentialsConfigured: void 0,
			badge__credentialsMissing: void 0,
			domainsLabel: void 0,
			error__invalidKeyFile: void 0,
			error__ssoRequired: {
				subtitle: void 0,
				title: void 0
			},
			formFieldHint__subjectEmail: void 0,
			formFieldInputPlaceholder__subjectEmail: void 0,
			formFieldInputPlaceholder__token: void 0,
			formFieldLabel__endpointUrl: void 0,
			formFieldLabel__serviceAccountKey: void 0,
			formFieldLabel__subjectEmail: void 0,
			formFieldLabel__token: void 0,
			instructions: {
				actionLabel__toggle: void 0,
				custom: {
					step1: void 0,
					step2: void 0,
					step3: void 0,
					step4: void 0
				},
				entra: {
					step1: void 0,
					step2: void 0,
					step3: void 0,
					step4: void 0
				},
				google: {
					step1: void 0,
					step2: void 0,
					step3: void 0,
					step4: void 0,
					step5: void 0
				},
				okta: {
					step1: void 0,
					step2: void 0,
					step3: void 0,
					step4: void 0
				}
			},
			notice__tokenShownOnce: void 0,
			subtitle: void 0,
			title: void 0,
			warning__ssoInactive: void 0
		},
		navbar: { title: void 0 },
		providers: {
			custom: void 0,
			entra: void 0,
			google: void 0,
			okta: void 0
		},
		roleMappingStep: {
			actionHint__reorder: void 0,
			actionLabel__reorder: void 0,
			alert__missingManageMembersPermission: {
				subtitle: void 0,
				title: void 0
			},
			columns: {
				directoryGroup: void 0,
				priority: void 0,
				role: void 0
			},
			disableDialog: {
				cancelButton: void 0,
				confirmButton: void 0,
				subtitle: void 0,
				title: void 0
			},
			empty__noGroups: {
				subtitle: void 0,
				title: void 0
			},
			enableDialog: {
				cancelButton: void 0,
				confirmButton: void 0,
				subtitle: void 0,
				title: void 0
			},
			error__loadMappings: void 0,
			everyoneElse: void 0,
			formFieldLabel__syncRoles: void 0,
			roleOption__unassigned: void 0,
			subtitle: void 0,
			title: void 0
		},
		stepper: {
			attributes: void 0,
			configure: void 0,
			roles: void 0,
			test: void 0
		},
		testStep: {
			actionLabel__complete: void 0,
			actionLabel__syncNow: void 0,
			badge__active: void 0,
			badge__deprovisioned: void 0,
			description: void 0,
			description__pull: void 0,
			empty__noUsersProvisioned: void 0,
			empty__waitingForFirstSync: void 0,
			empty__waitingForFirstUser: void 0,
			error__lastSyncFailed: void 0,
			error__loadUsers: void 0,
			error__syncFailed: void 0,
			note: void 0,
			noteLabel: void 0,
			subtitle: void 0,
			syncRow: {
				neverSynced: void 0,
				title: void 0
			},
			syncStatus__cancelled: void 0,
			syncStatus__failed: void 0,
			syncStatus__running: void 0,
			syncStatus__succeeded: void 0,
			title: void 0
		}
	},
	configureSSO: {
		activate: {
			activateButton: void 0,
			activeSubtitle: void 0,
			activeTitle: void 0,
			doneButton: void 0,
			skipButton: void 0,
			subtitle: void 0,
			title: void 0
		},
		changeProviderDialog: {
			cancelButton: void 0,
			confirmButton: void 0,
			subtitle: void 0,
			title: void 0
		},
		configureStep: {
			activeConnectionWarning: {
				dismiss: void 0,
				title: void 0
			},
			attributeMappingTable: { badges: {
				optional: void 0,
				required: void 0
			} },
			oidcCustom: {
				credentialsStep: {
					clientId: {
						label: void 0,
						placeholder: void 0
					},
					clientSecret: {
						label: void 0,
						placeholder: void 0
					},
					headerSubtitle: void 0,
					paragraph: void 0
				},
				endpointsStep: {
					discoveryUrl: {
						description: void 0,
						label: void 0,
						placeholder: void 0
					},
					headerSubtitle: void 0,
					manual: {
						authUrl: {
							label: void 0,
							placeholder: void 0
						},
						description: void 0,
						tokenUrl: {
							label: void 0,
							placeholder: void 0
						},
						userInfoUrl: {
							label: void 0,
							placeholder: void 0
						}
					},
					modes: {
						ariaLabel: void 0,
						discoveryUrl: void 0,
						manual: void 0
					}
				},
				mainHeaderTitle: void 0,
				redirectUriStep: {
					claims: {
						description: void 0,
						table: {
							columns: {
								attribute: void 0,
								claim: void 0
							},
							rows: {
								email: { attribute: void 0 },
								firstName: { attribute: void 0 },
								lastName: { attribute: void 0 },
								subject: { attribute: void 0 }
							}
						}
					},
					headerSubtitle: void 0,
					paragraph: void 0,
					redirectUri: { label: void 0 }
				}
			},
			samlCustom: {
				assignUsersStep: {
					headerSubtitle: void 0,
					paragraph: void 0
				},
				attributeMappingStep: {
					attributeMappingTable: {
						columns: {
							attributeName: void 0,
							userAttribute: void 0
						},
						rows: {
							email: {
								attributeName: void 0,
								userAttribute: void 0
							},
							firstName: {
								attributeName: void 0,
								userAttribute: void 0
							},
							lastName: {
								attributeName: void 0,
								userAttribute: void 0
							}
						}
					},
					headerSubtitle: void 0,
					paragraph: void 0
				},
				createAppStep: {
					createAppInstructions: { paragraph: void 0 },
					headerSubtitle: void 0,
					serviceProviderFields: {
						acsUrl: { label: void 0 },
						spEntityId: { label: void 0 }
					}
				},
				identityProviderMetadataStep: {
					headerSubtitle: void 0,
					manual: {
						description: void 0,
						issuer: {
							label: void 0,
							placeholder: void 0
						},
						signOnUrl: {
							label: void 0,
							placeholder: void 0
						},
						signingCertificate: {
							fileUploaded: void 0,
							label: void 0,
							removeFile: void 0,
							replaceFile: void 0,
							uploadFile: void 0
						}
					},
					metadataUrl: {
						description: void 0,
						label: void 0,
						placeholder: void 0
					},
					modes: {
						ariaLabel: void 0,
						manual: void 0,
						metadataUrl: void 0
					}
				},
				mainHeaderTitle: void 0
			},
			samlGoogle: {
				attributeMappingStep: {
					attributeMappingTable: {
						columns: {
							appAttribute: void 0,
							googleAttribute: void 0
						},
						rows: {
							email: {
								appAttribute: void 0,
								googleAttribute: void 0
							},
							firstName: {
								appAttribute: void 0,
								googleAttribute: void 0
							},
							lastName: {
								appAttribute: void 0,
								googleAttribute: void 0
							}
						}
					},
					headerSubtitle: void 0,
					paragraph: void 0,
					step1: void 0,
					step2: void 0
				},
				configureUserAccess: {
					assignUsersInstructions: {
						paragraph1: void 0,
						paragraph2: void 0,
						step1: void 0,
						step2: void 0,
						step3: void 0
					},
					headerSubtitle: void 0
				},
				createAppStep: {
					createAppInstructions: {
						step1: void 0,
						step2: void 0,
						step3: void 0,
						step4: void 0,
						title: void 0
					},
					headerSubtitle: void 0
				},
				identityProviderMetadataStep: {
					headerSubtitle: void 0,
					manual: {
						description: void 0,
						issuer: {
							label: void 0,
							placeholder: void 0
						},
						signOnUrl: {
							label: void 0,
							placeholder: void 0
						},
						signingCertificate: {
							fileUploaded: void 0,
							label: void 0,
							removeFile: void 0,
							replaceFile: void 0,
							uploadFile: void 0
						}
					},
					metadataFile: {
						description: void 0,
						fileUploaded: void 0,
						label: void 0,
						removeFile: void 0,
						replaceFile: void 0,
						uploadFile: void 0
					},
					modes: {
						ariaLabel: void 0,
						manual: void 0,
						metadataFile: void 0
					}
				},
				mainHeaderTitle: void 0,
				serviceProviderStep: {
					headerSubtitle: void 0,
					nameIdInstructions: {
						step1: void 0,
						step2: void 0
					},
					paragraph: void 0,
					serviceProviderFields: {
						acsUrl: { label: void 0 },
						spEntityId: { label: void 0 }
					},
					title: void 0
				}
			},
			samlMicrosoft: {
				attributeMappingStep: {
					attributeMappingTable: {
						columns: {
							attribute: void 0,
							claimName: void 0,
							value: void 0
						},
						copyClaimName: void 0,
						copyClaimNameCopied: void 0,
						rows: {
							email: {
								attribute: void 0,
								claimName: void 0,
								value: void 0
							},
							firstName: {
								attribute: void 0,
								claimName: void 0,
								value: void 0
							},
							lastName: {
								attribute: void 0,
								claimName: void 0,
								value: void 0
							}
						}
					},
					headerSubtitle: void 0,
					step1: void 0,
					step2: void 0,
					title: void 0
				},
				createAppStep: {
					assignUsersInstructions: {
						step1: void 0,
						step2: void 0,
						step3: void 0,
						step4: void 0,
						step5: void 0,
						title: void 0
					},
					createAppInstructions: {
						step1: void 0,
						step2: void 0,
						step3: void 0,
						step4: {
							label: void 0,
							subSteps: {
								appName: void 0,
								create: void 0,
								nonGallery: void 0
							}
						},
						title: void 0
					},
					headerSubtitle: void 0
				},
				identityProviderMetadataStep: {
					headerSubtitle: void 0,
					manual: {
						description: void 0,
						issuer: {
							label: void 0,
							placeholder: void 0
						},
						signOnUrl: {
							label: void 0,
							placeholder: void 0
						},
						signingCertificate: {
							fileUploaded: void 0,
							label: void 0,
							removeFile: void 0,
							replaceFile: void 0,
							uploadFile: void 0
						}
					},
					metadataUrl: {
						description: void 0,
						label: void 0,
						placeholder: void 0
					},
					modes: {
						ariaLabel: void 0,
						manual: void 0,
						metadataUrl: void 0
					}
				},
				mainHeaderTitle: void 0,
				serviceProviderStep: {
					headerSubtitle: void 0,
					serviceProviderFields: {
						acsUrl: { label: void 0 },
						spEntityId: { label: void 0 }
					},
					step1: void 0,
					step2: void 0,
					step3: void 0,
					step4: void 0,
					step5: void 0,
					step6: void 0,
					title: void 0
				}
			},
			samlOkta: {
				assignUsersStep: {
					assignUsersInstructions: {
						paragraph: void 0,
						step1: void 0,
						step2: void 0,
						step3: void 0,
						step4: void 0,
						step5: void 0
					},
					headerSubtitle: void 0
				},
				attributeMappingStep: {
					attributeMappingTable: {
						columns: {
							expression: void 0,
							name: void 0
						},
						rows: {
							email: {
								expression: void 0,
								name: void 0
							},
							firstName: {
								expression: void 0,
								name: void 0
							},
							lastName: {
								expression: void 0,
								name: void 0
							}
						}
					},
					headerSubtitle: void 0,
					paragraph: void 0,
					step1: void 0,
					step2: void 0
				},
				createAppStep: {
					completeSamlIntegrationInstructions: {
						step1: void 0,
						step2: void 0,
						title: void 0
					},
					createAppInstructions: {
						step1: void 0,
						step2: void 0,
						step3: void 0,
						step4: void 0,
						title: void 0
					},
					headerSubtitle: void 0,
					serviceProviderInstructions: {
						paragraph1: void 0,
						paragraph2: void 0,
						serviceProviderFields: {
							acsUrl: { label: void 0 },
							spEntityId: { label: void 0 }
						},
						title: void 0
					}
				},
				identityProviderMetadataStep: {
					headerSubtitle: void 0,
					manual: {
						description: void 0,
						issuer: {
							label: void 0,
							placeholder: void 0
						},
						signOnUrl: {
							label: void 0,
							placeholder: void 0
						},
						signingCertificate: {
							fileUploaded: void 0,
							label: void 0,
							removeFile: void 0,
							replaceFile: void 0,
							uploadFile: void 0
						}
					},
					metadataUrl: {
						description: void 0,
						label: void 0,
						placeholder: void 0
					},
					modes: {
						ariaLabel: void 0,
						manual: void 0,
						metadataUrl: void 0
					}
				},
				mainHeaderTitle: void 0
			},
			unsupportedProvider: {
				description: void 0,
				title: void 0
			}
		},
		connectionScopeBanner: {
			subtitle__adding: void 0,
			subtitle__editing: void 0,
			title__adding: void 0,
			title__editing: void 0
		},
		missingManageEnterpriseConnectionsPermission: {
			subtitle: "Contacta al administrador de tu organización para ampliar tus permisos.",
			title: "No tienes permiso para administrar el inicio de sesión único (SSO)"
		},
		navbar: { title: "Configurar inicio de sesión único (SSO)" },
		organizationDomainsStep: {
			domainCard: {
				badge__claimed: void 0,
				badge__expired: void 0,
				badge__unverified: "Sin verificar",
				badge__verified: "Verificado",
				checkboxLabel: void 0,
				expiredAtLabel: void 0,
				expiredLabel: void 0,
				removeButtonTooltip__lastVerifiedDomain: void 0,
				removeButtonTooltip__lastVerifiedDomainActive: void 0,
				txtRecord: {
					hostLabel: "Host / Nombre",
					instructions: "Agrega este registro TXT a tu proveedor de DNS. Lo verificaremos automáticamente una vez que el registro esté activo.",
					typeLabel: "Tipo",
					valueLabel: "Valor"
				},
				verifiedAtLabel: "Verificado el {{ date | shortDate('es-MX') }}",
				verifyAgainButton: void 0
			},
			domainSuggestion: {
				formButtonPrimary__add: "Agregar {{domain}}",
				messageLabel: "Tu correo electrónico usa {{domain}}. ¿Quieres agregarlo?"
			},
			formButtonPrimary__add: "Agregar",
			formFieldInputPlaceholder__domain: "Agregar dominio",
			formFieldLabel__domain: "Dominio",
			removeDomainDialog: {
				cancelButton: void 0,
				removeButton: void 0,
				subtitle__active: void 0,
				subtitle__inactive: void 0,
				title: void 0
			},
			subtitle: "Agrega y verifica la propiedad de los dominios que tu organización usa para iniciar sesión.",
			title: "Agregar dominios SSO"
		},
		resetConnectionDialog: {
			cancelButton: void 0,
			confirmationFieldLabel: void 0,
			confirmationFieldPlaceholder: void 0,
			resetButton: void 0,
			subtitle: void 0,
			title: void 0
		},
		selectProviderStep: {
			oidc: {
				groupLabel: void 0,
				oidcProvider: void 0
			},
			saml: {
				customSaml: "Proveedor SAML personalizado",
				google: void 0,
				groupLabel: "SAML",
				microsoft: void 0,
				okta: "Okta Workforce"
			},
			subtitle: "Selecciona el proveedor para el que vas a configurar SSO.",
			title: "Seleccionar proveedor",
			warning: "Una vez que se selecciona un proveedor no puedes cambiarlo hasta que termine la configuración"
		},
		signingCertificates: {
			addCertificate: void 0,
			expired: void 0,
			expires: void 0,
			expiryAfterSave: void 0,
			fileUnreadable: void 0,
			notACertificate: void 0,
			primary: void 0,
			primaryTooltip: void 0,
			removeCertificate: void 0
		},
		testConfigurationStep: {
			error__noSuccessfulTestRun: void 0,
			subtitle: void 0,
			testResults: {
				actionLabel__refresh: void 0,
				empty: {
					subtitle: void 0,
					title: void 0
				},
				polling: void 0,
				status__failed: void 0,
				status__pending: void 0,
				status__success: void 0,
				title: void 0
			},
			testRunDetails: {
				howToFix: {
					actionLabel__viewDocumentation: void 0,
					oauth_access_denied: { description: void 0 },
					oauth_fetch_user_error: {
						intro: void 0,
						step1: void 0,
						step2: void 0
					},
					oauth_token_exchange_error: { description: void 0 },
					saml_email_address_domain_mismatch: { description: void 0 },
					saml_response_relaystate_missing: { description: void 0 },
					saml_user_attribute_missing: {
						intro: void 0,
						step1: void 0,
						step2: void 0,
						step3: void 0
					},
					sectionTitle: void 0
				},
				parsedUserInfo: {
					email: void 0,
					firstName: void 0,
					sectionTitle: void 0
				},
				runDetails: {
					actionLabel__copied: void 0,
					actionLabel__copy: void 0,
					errorCode: void 0,
					fullMessage: void 0,
					sectionTitle: void 0,
					status: void 0,
					timestamp: void 0
				},
				title: void 0
			},
			testUrl: { actionLabel__open: void 0 },
			title: void 0
		}
	},
	createOrganization: {
		formButtonSubmit: "Crear organización",
		invitePage: { formButtonReset: "Saltar" },
		title: "Crear organización"
	},
	dates: {
		lastDay: "Ayer a las {{ date | timeString('es-ES') }}",
		next6Days: "{{ date | weekday('es-ES','long') }} a las {{ date | timeString('es-ES') }}",
		nextDay: "Mañana a las {{ date | timeString('es-ES') }}",
		numeric: "{{ date | numeric('es-ES') }}",
		previous6Days: "Último {{ date | weekday('es-ES','long') }} en {{ date | timeString('es-ES') }}",
		sameDay: "Hoy a las {{ date | timeString('es-ES') }}"
	},
	dividerText: "o",
	footerActionLink__alternativePhoneCodeProvider: void 0,
	footerActionLink__useAnotherMethod: "Usar otro método",
	footerPageLink__help: "Ayuda",
	footerPageLink__privacy: "Privacidad",
	footerPageLink__terms: "Términos",
	formButtonPrimary: "Continuar",
	formButtonPrimary__verify: "Verificar",
	formFieldAction__forgotPassword: "Has olvidado tu contraseña?",
	formFieldAction__hidePassword: "Ocultar contraseña",
	formFieldAction__showPassword: "Mostrar contraseña",
	formFieldError__matchingPasswords: "Las contraseñas coinciden.",
	formFieldError__notMatchingPasswords: "Las no contraseñas coinciden.",
	formFieldError__verificationLinkExpired: "El link de verificación expiro. Por favor vuelve a solicitarlo.",
	formFieldHintText__optional: "Opcional",
	formFieldHintText__slug: "Un slug es una identificación legible por humanos que debe ser única. Se utiliza a menudo en URL.",
	formFieldInputPlaceholder__apiKeyDescription: void 0,
	formFieldInputPlaceholder__apiKeyExpirationDate: void 0,
	formFieldInputPlaceholder__apiKeyName: void 0,
	formFieldInputPlaceholder__backupCode: "Ingresa el código de respaldo",
	formFieldInputPlaceholder__confirmDeletionUserAccount: "Eliminar cuenta",
	formFieldInputPlaceholder__emailAddress: "Ingresa tu correo electrónico",
	formFieldInputPlaceholder__emailAddress_username: "Ingresa el correo electrónico o nombre de usuario",
	formFieldInputPlaceholder__emailAddresses: "Ingrese o pegue una o más direcciones de correo electrónico, separadas por espacios o comas",
	formFieldInputPlaceholder__firstName: "Nombre",
	formFieldInputPlaceholder__lastName: "Apellido",
	formFieldInputPlaceholder__organizationDomain: "ejemplo.com",
	formFieldInputPlaceholder__organizationDomainEmailAddress: "nombre@example.com",
	formFieldInputPlaceholder__organizationName: "Nombre de la organización",
	formFieldInputPlaceholder__organizationSlug: "mi-organización",
	formFieldInputPlaceholder__password: "Ingresa tu contraseña",
	formFieldInputPlaceholder__phoneNumber: "Ingresa tu número de teléfono",
	formFieldInputPlaceholder__signUpPassword: void 0,
	formFieldInputPlaceholder__username: void 0,
	formFieldInput__emailAddress_format: void 0,
	formFieldLabel__apiKey: "Clave API",
	formFieldLabel__apiKeyDescription: "Descripción",
	formFieldLabel__apiKeyExpiration: "Expiración",
	formFieldLabel__apiKeyName: "Nombre de clave secreta",
	formFieldLabel__automaticInvitations: "Activar invitaciones automaticas para este dominio",
	formFieldLabel__backupCode: "Código de respaldo",
	formFieldLabel__confirmDeletion: "Confirmación",
	formFieldLabel__confirmPassword: "Confirme la contraseña",
	formFieldLabel__currentPassword: "Contraseña actual",
	formFieldLabel__emailAddress: "Correo electrónico",
	formFieldLabel__emailAddress_username: "Correo electrónico o nombre de usuario",
	formFieldLabel__emailAddresses: "Direcciones de correo",
	formFieldLabel__firstName: "Nombre",
	formFieldLabel__lastName: "Apellido",
	formFieldLabel__newPassword: "Nueva contraseña",
	formFieldLabel__organizationDomain: "Dominio",
	formFieldLabel__organizationDomainDeletePending: "Eliminar invitaciones y sugerencias pendientes",
	formFieldLabel__organizationDomainEmailAddress: "Verificación de correo",
	formFieldLabel__organizationDomainEmailAddressDescription: "Entrar una dirección de correo electrónico bajo este dominio para recibir un código y verificarlo.",
	formFieldLabel__organizationName: "Nombre de la Organización",
	formFieldLabel__organizationSlug: "Apodo",
	formFieldLabel__passkeyName: "Nombre de llave de acceso",
	formFieldLabel__password: "Contraseña",
	formFieldLabel__phoneNumber: "Número de teléfono",
	formFieldLabel__role: "Rol",
	formFieldLabel__signOutOfOtherSessions: "Cerrar sesión en todos los demás dispositivos",
	formFieldLabel__username: "Nombre de usuario",
	identityPreviewEditButton__emailAddress: void 0,
	identityPreviewEditButton__identifier: void 0,
	identityPreviewEditButton__phoneNumber: void 0,
	impersonationFab: {
		action__signOut: "Cerrar",
		title: "Registrado como {{identifier}}"
	},
	lastAuthenticationStrategy: "Último uso",
	maintenanceMode: "Actualmente estamos en mantenimiento, pero no te preocupes, no debería llevar más de unos minutos.",
	membershipRole__admin: "Administrador",
	membershipRole__basicMember: "Miembro",
	membershipRole__guestMember: "Invitado",
	oauthConsent: {
		action__allow: void 0,
		action__deny: void 0,
		offlineAccessNotice: void 0,
		redirectNotice: void 0,
		redirectUriModal: {
			subtitle: void 0,
			title: void 0
		},
		scopeList: {
			privateMetadata: void 0,
			title: void 0
		},
		subtitle: void 0,
		viewFullUrl: void 0,
		warning: void 0
	},
	oauthDeviceVerification: {
		action__tryAnotherCode: void 0,
		confirmation: {
			action__approve: void 0,
			action__deny: void 0,
			scopeListTitle: void 0,
			subtitle: void 0,
			title: void 0,
			warning: void 0
		},
		error: {
			expiredSubtitle: void 0,
			expiredTitle: void 0,
			genericSubtitle: void 0,
			genericTitle: void 0,
			invalidCode: void 0,
			rateLimitedSubtitle: void 0,
			rateLimitedTitle: void 0,
			unknownCode: void 0
		},
		start: {
			action__continue: void 0,
			subtitle: void 0,
			title: void 0,
			userCodeLabel: void 0
		},
		status: {
			alreadyApprovedSubtitle: void 0,
			alreadyApprovedTitle: void 0,
			alreadyDecidedSubtitle: void 0,
			alreadyDecidedTitle: void 0,
			alreadyDeniedSubtitle: void 0,
			alreadyDeniedTitle: void 0,
			approvedSubtitle: void 0,
			approvedTitle: void 0,
			consumedSubtitle: void 0,
			consumedTitle: void 0,
			deniedSubtitle: void 0,
			deniedTitle: void 0
		}
	},
	organizationList: {
		action__createOrganization: "Crear organización",
		action__invitationAccept: "Unirse",
		action__suggestionsAccept: "Pedir unirse",
		createOrganization: "Crear Organización",
		invitationAcceptedLabel: "Unido",
		subtitle: "para continuar con {{applicationName}}",
		suggestionsAcceptedLabel: "Aprobación pendiente",
		title: "Elige una cuenta",
		titleWithoutPersonal: "Elige una organización"
	},
	organizationProfile: {
		apiKeysPage: { title: void 0 },
		badge__automaticInvitation: "Invitaciones automaticas",
		badge__automaticSuggestion: "Sugerencias automaticas",
		badge__enterpriseSso: void 0,
		badge__manualInvitation: "Sin inscripciónes automaticas",
		badge__unverified: "No verificado",
		billingPage: {
			accountCreditsSection: {
				title: void 0,
				viewHistory: void 0
			},
			creditHistoryPage: {
				tableHeader__amount: void 0,
				tableHeader__date: void 0,
				title: void 0
			},
			paymentHistorySection: {
				empty: void 0,
				notFound: void 0,
				tableHeader__amount: void 0,
				tableHeader__date: void 0,
				tableHeader__status: void 0
			},
			paymentMethodsSection: {
				actionLabel__default: void 0,
				actionLabel__remove: void 0,
				add: void 0,
				addSubtitle: void 0,
				cancelButton: void 0,
				formButtonPrimary__add: void 0,
				formButtonPrimary__pay: void 0,
				payWithTestCardButton: void 0,
				removeMethod: {
					messageLine1: void 0,
					messageLine2: void 0,
					successMessage: void 0,
					title: void 0
				},
				title: void 0
			},
			start: {
				headerTitle__payments: void 0,
				headerTitle__plans: void 0,
				headerTitle__statements: void 0,
				headerTitle__subscriptions: void 0
			},
			statementsSection: {
				empty: void 0,
				itemCaption__paidForPlan: void 0,
				itemCaption__payerCredit: void 0,
				itemCaption__proratedCredit: void 0,
				itemCaption__subscribedAndPaidForPlan: void 0,
				notFound: void 0,
				tableHeader__amount: void 0,
				tableHeader__date: void 0,
				title: void 0,
				totalPaid: void 0
			},
			subscriptionsListSection: {
				actionLabel__manageSubscription: void 0,
				actionLabel__newSubscription: void 0,
				actionLabel__switchPlan: void 0,
				includedSeatsUsage: void 0,
				overview: void 0,
				paidSeatsUsage: void 0,
				seatLimit: void 0,
				seatLimitAndIncludedSeats: void 0,
				tableHeader__edit: void 0,
				tableHeader__plan: void 0,
				tableHeader__startDate: void 0,
				title: void 0
			},
			subscriptionsSection: { actionLabel__default: void 0 },
			switchPlansSection: { title: void 0 },
			title: void 0
		},
		createDomainPage: {
			subtitle: "Añade el dominio para verificar. Los usuarios con direcciones de correo electrónico en este dominio pueden unirse a la organización aquí o pedir unirse.",
			title: "Anadir dominio"
		},
		invitePage: {
			detailsTitle__inviteFailed: "No se pudieron enviar las invitaciones. Solucione lo siguiente y vuelva a intentarlo:",
			formButtonPrimary__continue: "Enviar invitaciones",
			formButtonPrimary__purchaseSeats: void 0,
			selectDropdown__role: "Seleccionar rol",
			subtitle: "Ingresa o pega una o más direcciones de correo electrónico, separadas por espacios o comas",
			successMessage: "Invitaciones enviadas con éxito",
			title: "Invitar miembros"
		},
		membersPage: {
			action__invite: "Invitar",
			action__search: "Buscar",
			activeMembersTab: {
				menuAction__remove: "Eliminar miembro",
				tableHeader__actions: "Acciones",
				tableHeader__joined: "Se unió",
				tableHeader__role: "Rol",
				tableHeader__user: "Usuario"
			},
			alerts: { roleSetMigrationInProgress: {
				subtitle: "Estamos actualizando los roles disponibles. Una vez hecho esto, podrás actualizar los roles de nuevo.",
				title: "Los roles están temporalmente bloqueados"
			} },
			detailsTitle__emptyRow: "No hay miembros para mostrar",
			invitationsTab: {
				autoInvitations: {
					headerSubtitle: "Invita usuarios conectando un correo electrónico del dominio con su organización. Cualquiera que se registre con un correo electrónico del dominio existente podrá unirse a la organización en cualquier momento.",
					headerTitle: "Invitaciones automáticas",
					primaryButton: "Gestionar dominios verificados"
				},
				table__emptyRow: "No hay invitaciones para mostrar"
			},
			invitedMembersTab: {
				menuAction__revoke: "Revocar invitación",
				tableHeader__invited: "Invitado"
			},
			requestsTab: {
				autoSuggestions: {
					headerSubtitle: "Los usuarios que inicien sesión con un correo electrónico del dominio existente podrán ver una sugerencia para solicitar unirse a su organización.",
					headerTitle: "Sugerencias automáticas",
					primaryButton: "Gestionar dominios verificados"
				},
				menuAction__approve: "Aprobado",
				menuAction__reject: "Rechazado",
				tableHeader__requested: "Acceso solicitado",
				table__emptyRow: "No hay solicitudes para mostrar"
			},
			start: {
				headerTitle__invitations: "Invitaciones",
				headerTitle__members: "Miembros",
				headerTitle__requests: "Solicitudes"
			}
		},
		navbar: {
			apiKeys: "Claves API",
			billing: "Facturación",
			description: "Gestiona tu organización.",
			general: "General",
			members: "Miembros",
			security: void 0,
			title: "Organización"
		},
		plansPage: {
			alerts: {
				noPermissionsToManageBilling: void 0,
				planMembershipLimitExceeded: void 0
			},
			title: void 0
		},
		profilePage: {
			dangerSection: {
				deleteOrganization: {
					actionDescription: "Escribe \"{{organizationName}}\" a continuación para continuar.",
					messageLine1: "¿Estás seguro que quieres eliminar esta organización?",
					messageLine2: "Esta acción es permanente e irreversible.",
					successMessage: "Haz eliminado la organización.",
					title: "Eliminar la organización"
				},
				leaveOrganization: {
					actionDescription: "Escribe \"{{organizationName}}\" a continuación para continuar.",
					messageLine1: "¿Estás seguro de que deseas abandonar esta organización? Perderás el acceso a esta organización y sus aplicaciones.",
					messageLine2: "Esta acción es permanente e irreversible.",
					successMessage: "Has dejado la organización.",
					title: "Abandonar la organización"
				},
				title: "Peligro"
			},
			domainSection: {
				menuAction__manage: "Gestionar",
				menuAction__remove: "Eliminar",
				menuAction__verify: "Verificar",
				primaryButton: "Añadir dominio",
				subtitle: "Permite a los usuarios conectarse automáticamente o solicitar unirse a la organización basado en un correo electrónico del dominio verificado.",
				title: "Dominios verificados"
			},
			successMessage: "La organización ha sido actualizada.",
			title: "Perfil de la organización"
		},
		removeDomainPage: {
			messageLine1: "Se eliminará el de correo electrónico del dominio {{domain}}.",
			messageLine2: "Los usuarios no podrán unirse a la organización de manera automática una vez que se haya eliminado.",
			successMessage: "{{domain}} se ha eliminado.",
			title: "Eliminar dominio"
		},
		securityPage: {
			connectionPage: {
				actions: {
					activate: void 0,
					continueSetup: void 0
				},
				dangerZone: {
					deactivateButton: void 0,
					removeButton: void 0,
					title: void 0
				},
				domains: { title: void 0 },
				identityProvider: {
					certificateExpires: void 0,
					certificates: void 0,
					certificatesCount: void 0,
					certificatesSummary: void 0,
					certificatesSummaryExpired: void 0,
					clientSecret: { placeholder: void 0 },
					editButton: void 0,
					form: { title: void 0 },
					title: void 0
				},
				name: {
					editButton: void 0,
					form: { title: void 0 },
					title: void 0
				},
				serviceProvider: {
					acsUrl: void 0,
					entityId: void 0,
					metadataUrl: void 0,
					redirectUri: void 0,
					title: void 0
				},
				settings: {
					allowAdditionalIdentifiers: {
						description: void 0,
						label: void 0
					},
					allowIdpInitiated: {
						description: void 0,
						label: void 0
					},
					allowSubdomains: {
						description: void 0,
						label: void 0
					},
					forceAuthn: {
						description: void 0,
						label: void 0
					},
					syncUserAttributes: {
						description: void 0,
						label: void 0
					},
					title: void 0
				}
			},
			directorySyncSection: {
				badge__active: void 0,
				badge__inactive: void 0,
				badge__ssoRequired: void 0,
				description: void 0,
				error__load: void 0,
				menuAction__activate: void 0,
				menuAction__deactivate: void 0,
				menuAction__edit: void 0,
				menuAction__remove: void 0,
				primaryButton__configure: void 0,
				removeDialog: {
					confirmButton: void 0,
					subtitle: void 0,
					title: void 0
				},
				title: void 0
			},
			removeDialog: {
				confirmButton: void 0,
				subtitle: void 0,
				title: void 0
			},
			ssoBypassPage: {
				action__add: void 0,
				action__search: void 0,
				addForm: {
					emailPlaceholder: void 0,
					error__allAlreadyAdded: void 0,
					error__alreadyAdded: void 0,
					error__memberNotFound: void 0,
					modeLabel: void 0,
					mode__email: void 0,
					mode__role: void 0,
					roleOption: void 0,
					roleWarning: void 0,
					submitButton: void 0,
					subtitle: void 0,
					title: void 0
				},
				bulkResult: {
					added: void 0,
					addedMember: void 0,
					added__one: void 0,
					domainNotServed: void 0,
					domainNotServed__one: void 0,
					notMember: void 0,
					notMember__one: void 0,
					unknown: void 0,
					unknown__one: void 0
				},
				table: {
					emptyState: void 0,
					emptyState__search: void 0,
					header__actions: void 0,
					header__user: void 0,
					menuAction__remove: void 0
				},
				title: void 0
			},
			ssoBypassSection: {
				allowlistCount: void 0,
				allowlistCount__one: void 0,
				allowlistLabel: void 0,
				description: void 0,
				error__load: void 0,
				menuAction__manage: void 0,
				title: void 0
			},
			ssoSection: {
				badge__active: void 0,
				badge__inProgress: void 0,
				badge__inactive: void 0,
				badge__unconfigured: void 0,
				descriptionLine1: void 0,
				domainLabel: void 0,
				menuAction__activate: void 0,
				menuAction__continue: void 0,
				menuAction__deactivate: void 0,
				menuAction__edit: void 0,
				menuAction__remove: void 0,
				primaryButton__addConnection: void 0,
				primaryButton__configure: void 0,
				primaryButton__continueConfiguration: void 0,
				primaryButton__startConfiguration: void 0,
				title: void 0,
				tooltip: void 0,
				tooltipLabel: void 0,
				tooltip__noRole: void 0
			},
			title: void 0
		},
		start: {
			headerTitle__general: "General",
			headerTitle__members: "Miembros",
			membershipSeatUsageLabel: void 0,
			profileSection: {
				primaryButton: "Actualizar perfil",
				title: "Perfil de la organización",
				uploadAction__title: "Logo"
			}
		},
		verifiedDomainPage: {
			dangerTab: {
				calloutInfoLabel: "Eliminar este dominio afectará a los usuarios invitados.",
				removeDomainActionLabel__remove: "Eliminar dominio",
				removeDomainSubtitle: "Eliminar este dominio de los dominios verificados",
				removeDomainTitle: "Eliminar dominio"
			},
			enrollmentTab: {
				automaticInvitationOption__description: "Los usuarios son invitados automáticamente a la organización cuando se registran y pueden unirse en cualquier momento.",
				automaticInvitationOption__label: "Invitaciones automáticas",
				automaticSuggestionOption__description: "Los usuarios reciben una sugerencia para solicitar unirse, pero deben ser aprobados por un administrador antes de poder unirse a la organización.",
				automaticSuggestionOption__label: "Sugerencias automáticas",
				calloutInfoLabel: "Cambiar el modo de inscripción solo afectará a los nuevos usuarios.",
				calloutInvitationCountLabel: "Invitaciones pendientes enviadas a usuarios: {{count}}",
				calloutSuggestionCountLabel: "Sugerencias pendientes enviadas a usuarios: {{count}}",
				manualInvitationOption__description: "Los usuarios solo pueden ser invitados manualmente a la organización.",
				manualInvitationOption__label: "Sin inscripción automática",
				subtitle: "Seleccione cómo los usuarios de este dominio pueden unirse a la organización."
			},
			start: {
				headerTitle__danger: "Peligro",
				headerTitle__enrollment: "Opciones de inscripción"
			},
			subtitle: "El dominio {{domain}} ahora está verificado. Continúa seleccionando el modo de inscripción.",
			title: "Actualizar {{domain}}"
		},
		verifyDomainPage: {
			formSubtitle: "Introduce el código de verificación enviado a tu dirección de correo electrónico",
			formTitle: "Código de verificación",
			resendButton: "No recibiste un código? Reenviar",
			subtitle: "El dominio {{domainName}} necesita ser verificado vía correo electrónico.",
			subtitleVerificationCodeScreen: "Se envió un código de verificación a {{emailAddress}}. Introduce el código para continuar.",
			title: "Verificar dominio"
		}
	},
	organizationSwitcher: {
		action__closeOrganizationSwitcher: void 0,
		action__createOrganization: "Crear Organización",
		action__invitationAccept: "Unirse",
		action__manageOrganization: "Administrar Organización",
		action__openOrganizationSwitcher: void 0,
		action__suggestionsAccept: "Solicitar unirse",
		notSelected: "Ninguna organización seleccionada",
		personalWorkspace: "Espacio personal",
		suggestionsAcceptedLabel: "Pendiente de aprobación"
	},
	paginationButton__next: "Siguiente",
	paginationButton__previous: "Anterior",
	paginationRowText__displaying: "Mostrando",
	paginationRowText__of: "de",
	reverification: {
		alternativeMethods: {
			actionLink: "Solicitar ayuda",
			actionText: "¿No posees ninguno de estos?",
			blockButton__backupCode: "Utiliza un código de respaldo",
			blockButton__emailCode: "Envía el código a {{identifier}}",
			blockButton__passkey: "Utiliza tu llave de acceso",
			blockButton__password: "Continúa con tu contraseña",
			blockButton__phoneCode: "Enviar un mensaje de texto a {{identifier}}",
			blockButton__totp: "aplicación de autenticación",
			getHelp: {
				blockButton__emailSupport: "Soporte por correo electrónico",
				content: "Si tienes problemas para iniciar sesión",
				title: "Obtener ayuda"
			},
			subtitle: "¿Tienes problemas? Puedes utilizar cualquiera de estos métodos para iniciar sesión",
			title: "Utiliza otro método"
		},
		backupCodeMfa: {
			subtitle: "Tu código de respaldo es el que obtuviste cuando configuraste la autenticación en dos pasos",
			title: "Ingresa tu código de respaldo"
		},
		emailCode: {
			formTitle: "Código de verificación",
			resendButton: "¿No recibiste un código? Reenviar",
			subtitle: "para continuar con {{applicationName}}",
			title: "Revisa tu correo electrónico"
		},
		noAvailableMethods: {
			message: "No se puede proceder con el inicio de sesión. No hay ningún factor de autenticación disponible",
			subtitle: "Ocurrió un error",
			title: "No se puede iniciar sesión"
		},
		passkey: {
			blockButton__passkey: "Utiliza tu llave de acceso",
			subtitle: "Utilizar tu llave de acceso confirma que eres tú. Tu dispositivo puede solicitar tu huella dactilar, rostro o pantalla de bloqueo.",
			title: "Utiliza tu llave de acceso"
		},
		passkeyMfa: {
			blockButton__passkey: void 0,
			subtitle: void 0,
			title: void 0
		},
		password: {
			actionLink: "Utiliza otro método",
			subtitle: "Ingresa tu contraseña actual para continuar",
			title: "Verificación requerida"
		},
		phoneCode: {
			formTitle: "Código de verificación",
			resendButton: "¿No recibiste un código? Reenviar",
			subtitle: "Ingresa el código enviado a tu teléfono para continuar",
			title: "Verificación requerida"
		},
		phoneCodeMfa: {
			formTitle: "Código de verificación",
			resendButton: "¿No recibiste un código? Reenviar",
			subtitle: "Ingresa el código enviado a tu teléfono para continuar",
			title: "Verificación requerida"
		},
		totpMfa: {
			formTitle: "Código de verificación",
			subtitle: "Ingresa el código generado por la aplicación de autenticación para continuar",
			title: "Verificación requerida"
		}
	},
	searchInput: { action__clear: void 0 },
	signIn: {
		accountSwitcher: {
			action__addAccount: "Agregar cuenta",
			action__signOutAll: "Cerrar sesión de todas las cuentas",
			subtitle: "Seleccione la cuenta con la que desea continuar.",
			title: "Elija una cuenta"
		},
		alternativeMethods: {
			actionLink: "Obtener ayuda",
			actionText: "¿No tienes ninguno de estos?",
			blockButton__backupCode: "Usa un código de respaldo",
			blockButton__emailCode: "Enviar código a{{identifier}}",
			blockButton__emailLink: "Enviar enlace a{{identifier}}",
			blockButton__passkey: "Inicia sesión con tu llave de acceso",
			blockButton__password: "Inicia sesión con tu contraseña",
			blockButton__phoneCode: "Enviar código a{{identifier}}",
			blockButton__totp: "Usa tu aplicación de autenticación",
			getHelp: {
				blockButton__emailSupport: "Soporte de correo electrónico",
				content: "Si tienes problemas para ingresar a tu cuenta, envíenos un correo electrónico y trabajaremos contigo para restablecer el acceso lo antes posible.",
				title: "Obtener ayuda"
			},
			subtitle: "Si estás experimentando problemas, puedes utilizar uno de estos métodos para ingresar.",
			title: "Utiliza otro método"
		},
		alternativePhoneCodeProvider: {
			formTitle: void 0,
			resendButton: void 0,
			subtitle: void 0,
			title: void 0
		},
		backupCodeMfa: {
			subtitle: "para continuar a {{applicationName}}",
			title: "Introduce un código de seguridad"
		},
		emailCode: {
			formTitle: "Código de verificación",
			resendButton: "Re-enviar código",
			subtitle: "para continuar a {{applicationName}}",
			title: "Revise su correo electrónico"
		},
		emailCodeMfa: {
			formTitle: "Revise su correo electrónico",
			resendButton: "¿No recibiste un código? Reenviar",
			subtitle: "para continuar a {{applicationName}}",
			title: "Revise su correo electrónico"
		},
		emailLink: {
			clientMismatch: {
				subtitle: "Para continuar, abre el enlace de verificación en tu dispositivo o navegador donde intentaste iniciar sesión",
				title: "El enlace de verificación es inválido para este dispositivo"
			},
			expired: {
				subtitle: "Regresa a la pestaña original para continuar.",
				title: "El enlace de verificación ha expirado"
			},
			failed: {
				subtitle: "Regresa a la pestaña original para continuar.",
				title: "El enlace de verificación es inválido"
			},
			formSubtitle: "Utiliza el enlace de verificación enviado a tu correo electrónico",
			formTitle: "Enlace de verificación",
			loading: {
				subtitle: "Serás redireccionado pronto",
				title: "Iniciando sesión..."
			},
			resendButton: "¿No recibiste un enlace? Reenviar",
			subtitle: "para continuar con {{applicationName}}",
			title: "Revisa tu correo electrónico",
			unusedTab: { title: "Puedes cerrar esta pestaña" },
			verified: {
				subtitle: "Serás redireccionado pronto",
				title: "Sesión iniciada correctamente"
			},
			verifiedSwitchTab: {
				subtitle: "Regresa a la pestaña original para continuar",
				subtitleNewTab: "Regresa a la pestaña recién abierta para continuar",
				titleNewTab: "Sesión iniciada en otra pestaña"
			},
			verifiedTransferable: {
				subtitle: void 0,
				title: void 0
			}
		},
		emailLinkMfa: {
			formSubtitle: "Utiliza el enlace de verificación enviado a tu correo electrónico",
			resendButton: "¿No recibiste el enlace? Reenviar",
			subtitle: "para continuar a {{applicationName}}",
			title: "Revisa tu correo electrónico"
		},
		enterpriseConnections: {
			subtitle: void 0,
			title: void 0
		},
		enterpriseSSO: { formButtonPrimary: void 0 },
		forgotPassword: {
			formTitle: "Código para restablecer contraseña",
			resendButton: "¿No recibiste un código? Reenviar",
			subtitle: "para restablecer tu contraseña",
			subtitle_email: "Primero, ingresa el código enviado a tu correo electrónico",
			subtitle_phone: "Primero, ingresa el código enviado a tu teléfono",
			title: "Restablecer contraseña"
		},
		forgotPasswordAlternativeMethods: {
			blockButton__resetPassword: "Restablece tu contraseña",
			label__alternativeMethods: "O, inicia sesión con otro método",
			title: "¿Olvidaste la contraseña?"
		},
		newDeviceVerificationNotice: "Estás iniciando sesión desde un dispositivo nuevo. Estamos pidiendo verificación para mantener tu cuenta segura.",
		noAvailableMethods: {
			message: "No se puede continuar con el inicio de sesión. No hay ningún factor de autenticación disponible.",
			subtitle: "Ocurrió un error",
			title: "No puedo iniciar sesión"
		},
		passkey: {
			subtitle: "Usando tu llave de acceso confirmas que eres tú. Tu dispositivo puede pedirte la huella dactilar, el rostro o el bloqueo de pantalla.",
			title: "Usa tu llave de acceso"
		},
		passkeyMfa: {
			subtitle: void 0,
			title: void 0
		},
		password: {
			actionLink: "Utiliza otro método",
			subtitle: "para continuar con {{applicationName}}",
			title: "Introduzca su contraseña"
		},
		passwordCompromised: { title: void 0 },
		passwordPwned: { title: "Contraseña en peligro" },
		passwordUntrusted: { title: void 0 },
		phoneCode: {
			formTitle: "Código de verificación",
			resendButton: "Reenviar código",
			subtitle: "para continuar con {{applicationName}}",
			title: "Revisa tu teléfono"
		},
		phoneCodeMfa: {
			formTitle: "Código de verificación",
			resendButton: "Reenviar código",
			subtitle: "para continuar con {{applicationName}}",
			title: "Revisa tu teléfono"
		},
		protectCheck: {
			loading: void 0,
			retryButton: void 0,
			subtitle: void 0,
			title: void 0
		},
		resetPassword: {
			formButtonPrimary: "Restablecer contraseña",
			requiredMessage: "Por razones de seguridad, es necesario restablecer su contraseña.",
			successMessage: "Tu contraseña se ha cambiado correctamente. Te estamos redirigiendo, por favor espera un momento.",
			title: "Establecer nueva contraseña"
		},
		resetPasswordMfa: { detailsLabel: "Es necesario verificar su identidad para restablecer su contraseña." },
		ssoBypass: {
			actionLink: void 0,
			code: {
				resendButton: void 0,
				subtitle: void 0,
				title: void 0
			},
			notice: void 0
		},
		start: {
			actionLink: "Registrarse",
			actionLink__join_waitlist: "Unirse a la lista de espera",
			actionLink__use_email: "Utilizar correo electrónico",
			actionLink__use_email_username: "Utilizar correo electrónico o nombre de usuario",
			actionLink__use_passkey: "Utilizar llave de acceso",
			actionLink__use_phone: "Utilizar teléfono",
			actionLink__use_username: "Utilizar nombre de usuario",
			actionText: "¿No tiene cuenta?",
			actionText__join_waitlist: void 0,
			alternativePhoneCodeProvider: {
				actionLink: void 0,
				label: void 0,
				subtitle: void 0,
				title: void 0
			},
			subtitle: "para continuar con {{applicationName}}",
			subtitleCombined: void 0,
			title: "Iniciar sesión",
			titleCombined: "Para continuar con {{applicationName}}"
		},
		totpMfa: {
			formTitle: "Código de verificación",
			subtitle: "Para continuar, por favor introduce el código generado por tu aplicación de autenticación",
			title: "Verificación de dos pasos"
		},
		web3Solana: {
			subtitle: "Selecciona una billetera abajo para iniciar sesión",
			title: "Iniciar sesión con Solana"
		}
	},
	signInEnterPasswordTitle: "Ingresa tu contraseña",
	signUp: {
		alternativePhoneCodeProvider: {
			resendButton: void 0,
			subtitle: void 0,
			title: void 0
		},
		continue: {
			actionLink: "Entrar",
			actionText: "¿Tienes una cuenta?",
			subtitle: "Por favor completa los datos para continuar",
			title: "Completa los datos faltantes"
		},
		emailCode: {
			formSubtitle: "Ingresa el código de verificación enviado a tu correo electrónico",
			formTitle: "Código de verificación",
			resendButton: "Reenviar código",
			subtitle: "Ingresa el código de verificación enviado a tu correo electrónico",
			title: "Verifica tu correo electrónico"
		},
		emailLink: {
			clientMismatch: {
				subtitle: "Para continuar, abre el enlace de verificación en el dispositivo o navegador desde el que estás intentando registrarte",
				title: "El enlace de verificación es inválido para este dispositivo"
			},
			formSubtitle: "Utiliza el enlace de verificación enviado a tu dirección de correo electrónico",
			formTitle: "Enlace de verificación",
			loading: { title: "Registrando..." },
			resendButton: "¿No recibiste el enlace? Reenviar",
			subtitle: "para continuar a {{applicationName}}",
			title: "Verifica tu correo electrónico",
			verified: { title: "Registrado con éxito" },
			verifiedSwitchTab: {
				subtitle: "Regresa a la pestaña recién abierta para continuar",
				subtitleNewTab: "Regresa a la pestaña anterior para continuar",
				title: "Correo electrónico verificado con éxito"
			}
		},
		enterpriseConnections: {
			subtitle: void 0,
			title: void 0
		},
		legalConsent: {
			checkbox: {
				label__onlyPrivacyPolicy: void 0,
				label__onlyTermsOfService: void 0,
				label__termsOfServiceAndPrivacyPolicy: void 0
			},
			continue: {
				subtitle: void 0,
				title: void 0
			}
		},
		phoneCode: {
			formSubtitle: "Introduzca el código de verificación enviado a su número de teléfono.",
			formTitle: "Código de verificación",
			resendButton: "Reenviar código",
			subtitle: "para continuar a {{applicationName}}",
			title: "Verifica tu teléfono"
		},
		protectCheck: {
			loading: void 0,
			retryButton: void 0,
			subtitle: void 0,
			title: void 0
		},
		restrictedAccess: {
			actionLink: "Iniciar sesión",
			actionText: "¿Tienes cuenta?",
			blockButton__emailSupport: "Soporte por correo electrónico",
			blockButton__joinWaitlist: "Unirse a la lista de espera",
			subtitle: "Los registros están desactivados actualmente. Si crees que tienes acceso, contacta soporte",
			subtitleWaitlist: "Los registros están desactivados actualmente. Para ser el primero en saber cuando estemos listos, únete a la lista de espera",
			title: "Acceso restringido"
		},
		start: {
			actionLink: "Inicar sesión",
			actionLink__use_email: "Utilizar el correo electrónico",
			actionLink__use_phone: "Utilizar el número telefónico",
			actionText: "¿Tienes una cuenta?",
			alternativePhoneCodeProvider: {
				actionLink: void 0,
				label: void 0,
				subtitle: void 0,
				title: void 0
			},
			subtitle: "para continuar con {{applicationName}}",
			subtitleCombined: "para continuar con {{applicationName}}",
			title: "Crea tu cuenta",
			titleCombined: "Crea tu cuenta"
		},
		web3Solana: {
			subtitle: "Selecciona una billetera abajo para registrarte",
			title: "Registrarse con Solana"
		}
	},
	socialButtonsBlockButton: "Continuar con {{provider|titleize}}",
	socialButtonsBlockButtonManyInView: "{{provider|titleize}}",
	taskChooseOrganization: {
		alerts: { organizationAlreadyExists: "Ya existe una organización para el nombre de empresa detectado ({{organizationName}}) y {{organizationDomain}}. Únete por invitación." },
		chooseOrganization: {
			action__createOrganization: "Crear nueva organización",
			action__invitationAccept: "Unirse",
			action__suggestionsAccept: "Pedir unirse",
			subtitle: "Unirse a una organización existente o crear una nueva",
			subtitle__createOrganizationDisabled: "Unirse a una organización existente",
			suggestionsAcceptedLabel: "Pendiente de aprobación",
			title: "Elegir una organización"
		},
		createOrganization: {
			formButtonReset: "Cancelar",
			formButtonSubmit: "Continuar",
			formFieldInputPlaceholder__name: "Mi Organización",
			formFieldInputPlaceholder__slug: "mi-organizacion",
			formFieldLabel__name: "Nombre",
			formFieldLabel__slug: "Identificador",
			subtitle: "Ingrese los detalles de su organización para continuar",
			title: "Configurar su organización"
		},
		organizationCreationDisabled: {
			subtitle: "Contacte al administrador de su organización para obtener una invitación.",
			title: "Debe pertenecer a una organización"
		},
		signOut: {
			actionLink: "Cerrar sesión",
			actionText: "Registrado como {{identifier}}"
		}
	},
	taskResetPassword: {
		formButtonPrimary: void 0,
		signOut: {
			actionLink: void 0,
			actionText: void 0
		},
		subtitle: void 0,
		title: void 0
	},
	taskSetupMfa: {
		badge: void 0,
		signOut: {
			actionLink: void 0,
			actionText: void 0
		},
		smsCode: {
			addPhone: {
				formButtonPrimary: void 0,
				infoText: void 0
			},
			addPhoneNumber: void 0,
			cancel: void 0,
			subtitle: void 0,
			success: {
				finishButton: void 0,
				message1: void 0,
				message2: void 0,
				title: void 0
			},
			title: void 0,
			verifyPhone: {
				formButtonPrimary: void 0,
				formTitle: void 0,
				resendButton: void 0,
				subtitle: void 0,
				title: void 0
			}
		},
		start: {
			methodSelection: {
				phoneCode: void 0,
				totp: void 0
			},
			subtitle: void 0,
			title: void 0
		},
		totpCode: {
			addAuthenticatorApp: {
				buttonAbleToScan__nonPrimary: void 0,
				buttonUnableToScan__nonPrimary: void 0,
				formButtonPrimary: void 0,
				formButtonReset: void 0,
				infoText__ableToScan: void 0,
				infoText__unableToScan: void 0,
				inputLabel__unableToScan1: void 0
			},
			success: {
				finishButton: void 0,
				message1: void 0,
				message2: void 0,
				title: void 0
			},
			title: void 0,
			verifyTotp: {
				formButtonPrimary: void 0,
				formButtonReset: void 0,
				formTitle: void 0,
				subtitle: void 0,
				title: void 0
			}
		}
	},
	unstable__errors: {
		action_blocked: void 0,
		already_a_member_in_organization: "{{email}} ya es miembro de la organización.",
		api_key_name_already_exists: void 0,
		api_key_usage_exceeded: void 0,
		avatar_file_size_exceeded: "El tamaño del archivo supera el límite máximo de 10 MB. Por favor, elige un archivo más pequeño.",
		avatar_file_type_invalid: "Tipo de archivo no compatible. Por favor, sube una imagen JPG, PNG, GIF o WEBP.",
		captcha_invalid: "El registro falló debido a fallos en la validación de seguridad. Por favor, recarga la página o contáctanos para obtener más asistencia.",
		captcha_unavailable: "El registro falló debido a fallos en la validación de robot. Por favor, recarga la página o contáctanos para obtener más asistencia.",
		form_code_incorrect: "Código incorrecto.",
		form_email_address_blocked: "Los servicios de correo electrónico temporal no están soportados. Por favor, use su dirección de correo electrónico regular para crear una cuenta.",
		form_identifier_exists__email_address: "El correo electrónico ya existe",
		form_identifier_exists__phone_number: "El número telefónico ya existe.",
		form_identifier_exists__username: "El nombre de usuario ya existe.",
		form_identifier_not_found: "No se encontró una cuenta con esos detalles.",
		form_new_password_matches_current: void 0,
		form_param_format_invalid: "Formato inválido.",
		form_param_format_invalid__email_address: "El correo electrónico debe ser válido.",
		form_param_format_invalid__phone_number: "El número telefónico debe ser en un formato válido internacional.",
		form_param_max_length_exceeded__first_name: "El nombre debe tener menos de 256 caracteres.",
		form_param_max_length_exceeded__last_name: "El apellido debe tener menos de 256 caracteres.",
		form_param_max_length_exceeded__name: "El nombre debe tener menos de 256 caracteres.",
		form_param_nil: "Este campo es rquerido y no puede estar vacío.",
		form_param_type_invalid: void 0,
		form_param_type_invalid__email_address: void 0,
		form_param_type_invalid__phone_number: void 0,
		form_param_value_invalid: "Valor inválido",
		form_password_compromised__sign_in: void 0,
		form_password_incorrect: "Contraseña incorrecta.",
		form_password_length_too_short: "La contraseña es muy corta.",
		form_password_matches_identifier: void 0,
		form_password_not_strong_enough: "La contraseña no es suficientemente segura.",
		form_password_or_identifier_incorrect: "La contraseña o la dirección de correo electrónico es incorrecta. Inténtalo de nuevo o usa otro método.",
		form_password_pwned: "Esta contraseña se encontró como parte de una brecha y no se puede utilizar, intenta con otra contraseña.",
		form_password_pwned__sign_in: "Esta contraseña se encontró como parte de una brecha y no se puede utilizar, por favor restablece tu contraseña.",
		form_password_size_in_bytes_exceeded: "La contraseña excede el número máximo de bytes permitidos. Por favor, elimine algunos caracteres especiales o reduzca la longitud de la contraseña.",
		form_password_untrusted__sign_in: void 0,
		form_password_validation_failed: "Contraseña incorrecta",
		form_username_invalid_character: "El nombre de usuario contiene caracteres inválidos.",
		form_username_invalid_length: "La longitud del nombre de usuario es demasiado corta.",
		form_username_needs_non_number_char: "Tu nombre de usuario debe contener al menos un carácter no numérico.",
		identification_deletion_failed: "No se puede eliminar la última identificación.",
		insufficient_seats_change_plan: void 0,
		insufficient_seats_contact_support: void 0,
		not_allowed_access: "No tienes permiso para acceder a esta página.",
		oauth_access_denied: void 0,
		organization_domain_blocked: "Este correo electrónico del dominio está bloqueado, intenta con otro.",
		organization_domain_common: "Este correo electrónico del dominio es muy común, intenta con otro.",
		organization_domain_exists_for_enterprise_connection: "Este dominio ya esta en uso para tú organización",
		organization_membership_quota_exceeded: "Alcanzaste el limite de miembros en la organización, incluyendo las invitaciones enviadas.",
		organization_minimum_permissions_needed: "Debe existir al menos un miembro en la organización.",
		organization_not_found_or_unauthorized: void 0,
		organization_not_found_or_unauthorized_with_create_organization_disabled: void 0,
		passkey_already_exists: "Ya se ha registrado una llave de acceso en este dispositivo.",
		passkey_not_supported: "Las llaves de acceso no son compatibles con este dispositivo.",
		passkey_pa_not_supported: "El registro requiere un autenticador de plataforma, pero el dispositivo no es compatible.",
		passkey_registration_cancelled: "El registro de la llave de acceso se ha cancelado o ha expirado.",
		passkey_retrieval_cancelled: "La verificación de la llave de acceso se ha cancelado o ha expirado.",
		passwordComplexity: {
			maximumLength: "menos de {{length}} caracteres",
			minimumLength: "{{length}} o más caracteres",
			requireLowercase: "al menos una letra minúscula",
			requireNumbers: "al menos un número",
			requireSpecialCharacter: "al menos un carácter especial",
			requireUppercase: "al menos una letra mayúscula",
			sentencePrefix: "Tu contraseña debe contener"
		},
		phone_number_exists: "Este número de telefónico ya está en uso.",
		protect_check_aborted: void 0,
		protect_check_already_resolved: void 0,
		protect_check_execution_failed: void 0,
		protect_check_invalid_script: void 0,
		protect_check_invalid_sdk_url: void 0,
		protect_check_required: void 0,
		protect_check_script_load_failed: void 0,
		protect_check_timed_out: void 0,
		protect_check_unsupported_environment: void 0,
		session_exists: "Ya has iniciado sesión",
		sso_bypass_domain_not_served: void 0,
		ticket_expired_code: void 0,
		ticket_invalid_code: void 0,
		too_many_unverified_identifications: void 0,
		web3_missing_identifier: "No se puede encontrar la extension de la billetera Web3. Instala una para continuar",
		web3_signature_request_rejected: "Has rechazado la solicitud de firma. Inténtalo de nuevo para continuar.",
		web3_solana_signature_generation_failed: "Se produjo un error al generar la firma. Inténtalo de nuevo para continuar.",
		zxcvbn: {
			couldBeStronger: "Tu contraseña funciona, pero puede ser más segura. Prueba añadiendo más caracteres.",
			goodPassword: "Tu contraseña cumple con todos los requisitos necesarios.",
			notEnough: "Tu contraseña no es lo suficientemente segura.",
			suggestions: {
				allUppercase: "Escribe algunas letras en mayúsculas, pero no todas.",
				anotherWord: "Añade palabras menos comunes.",
				associatedYears: "Evita años asociados contigo.",
				capitalization: "Escribe algunas letras en mayúsculas además de la primera.",
				dates: "Evita fechas asociadas contigo.",
				l33t: "Evita sustituciones predecibles como '@' por 'a'",
				longerKeyboardPattern: "Usa patrones de teclado más largos y cambia la dirección de escritura varias veces.",
				noNeed: "Puedes crear contraseñas seguras sin usar símbolos, números o mayúsculas.",
				pwned: "Si utilizas esta contraseña en otro lugar, deberías cambiarla.",
				recentYears: "Evita años recientes.",
				repeated: "Evita palabras y letras repetidas.",
				reverseWords: "Evita palabras comunes escritas al revés",
				sequences: "Evita secuencias de letras comunes.",
				useWords: "Utiliza varias palabras, pero evita frases comunes."
			},
			warnings: {
				common: "Es una contraseña utilizada comúnmente.",
				commonNames: "Nombres y apellidos comunes son fáciles de adivinar.",
				dates: "Las fechas son fáciles de adivinar.",
				extendedRepeat: "Patrones repetidos como \"abcabcabc\" son fáciles de adivinar.",
				keyPattern: "Patrones cortos son fáciles de adivinar.",
				namesByThemselves: "Nombres y apellidos son fáciles de adivinar.",
				pwned: "Tu contraseña fue expuesta por una violación de datos en Internet.",
				recentYears: "Los años recientes son fáciles de adivinar.",
				sequences: "Patrones comunes como \"abc\" son fáciles de adivinar",
				similarToCommon: "Es similar a una contraseña utilizada habitualmente.",
				simpleRepeat: "Caracteres repetidos como \"aaa\" son fáciles de adivinar",
				straightRow: "Teclas consecutivas en tu teclado son fáciles de adivinar.",
				topHundred: "Es una contraseña utilizada con mucha frecuencia.",
				topTen: "Es de las contraseñas más utilizadas.",
				userInputs: "No debería haber datos personales o relacionados con esta página.",
				wordByItself: "Palabras únicas son fáciles de adivinar."
			}
		}
	},
	userButton: {
		action__addAccount: "Añadir cuenta",
		action__closeUserMenu: void 0,
		action__manageAccount: "Administrar cuenta",
		action__openUserMenu: void 0,
		action__signOut: "Cerrar sesión",
		action__signOutAll: "Salir de todas las cuentas",
		label__accountActions: "Acciones de cuenta",
		label__activeSessions: "Sesiones activas",
		label__userButtonPopover: "Panel de cuenta"
	},
	userProfile: {
		apiKeysPage: { title: void 0 },
		backupCodePage: {
			actionLabel__copied: "Copiado!",
			actionLabel__copy: "Copiar todo",
			actionLabel__download: "Descargar .txt",
			actionLabel__print: "Imprimir",
			infoText1: "Se habilitarán códigos de respaldo para esta cuenta.",
			infoText2: "Mantén los códigos de respaldo en secreto y guárdalos de forma segura. Puedes regenerar códigos de respaldo si sospechas que se han visto comprometidos.",
			subtitle__codelist: "Guárdalos de forma segura y mantenlos en secreto.",
			successMessage: "Los códigos de respaldo ahora están habilitados. Puedes utilizar uno de estos para iniciar sesión en tu cuenta, si pierdes el acceso a tu dispositivo de autenticación. Cada código solo se puede utilizar una vez.",
			successSubtitle: "Puedes utilizar uno de estos para iniciar sesión en tu cuenta, si pierdes el acceso a tu dispositivo de autenticación.",
			title: "Agregar verificación de código de respaldo",
			title__codelist: "Códigos de respaldo"
		},
		billingPage: {
			accountCreditsSection: {
				title: void 0,
				viewHistory: void 0
			},
			creditHistoryPage: {
				tableHeader__amount: void 0,
				tableHeader__date: void 0,
				title: void 0
			},
			paymentHistorySection: {
				empty: void 0,
				notFound: void 0,
				tableHeader__amount: void 0,
				tableHeader__date: void 0,
				tableHeader__status: void 0
			},
			paymentMethodsSection: {
				actionLabel__default: "Predeterminado",
				actionLabel__remove: "Eliminar",
				add: "Agregar un nuevo método de pago",
				addSubtitle: "Agregar un nuevo método de pago a tu cuenta.",
				cancelButton: "Cancelar",
				formButtonPrimary__add: "Agregar Método de Pago",
				formButtonPrimary__pay: "Pagar {{amount}}",
				payWithTestCardButton: void 0,
				removeMethod: {
					messageLine1: "{{identifier}} será eliminado de esta cuenta.",
					messageLine2: "No podrás utilizar este método de pago para ninguna suscripción actual y estas ya no funcionarán.",
					successMessage: "{{paymentMethod}} ha sido eliminada de tu cuenta.",
					title: "Eliminar método de pago"
				},
				title: "Opciones disponibles"
			},
			start: {
				headerTitle__payments: void 0,
				headerTitle__plans: "Planes",
				headerTitle__statements: "Facturas",
				headerTitle__subscriptions: "Suscripciones"
			},
			statementsSection: {
				empty: void 0,
				itemCaption__paidForPlan: void 0,
				itemCaption__payerCredit: void 0,
				itemCaption__proratedCredit: void 0,
				itemCaption__subscribedAndPaidForPlan: void 0,
				notFound: void 0,
				tableHeader__amount: void 0,
				tableHeader__date: void 0,
				title: void 0,
				totalPaid: void 0
			},
			subscriptionsListSection: {
				actionLabel__manageSubscription: void 0,
				actionLabel__newSubscription: void 0,
				actionLabel__switchPlan: void 0,
				overview: void 0,
				tableHeader__edit: void 0,
				tableHeader__plan: void 0,
				tableHeader__startDate: void 0,
				title: void 0
			},
			subscriptionsSection: { actionLabel__default: void 0 },
			switchPlansSection: { title: void 0 },
			title: "Facturación y Pagos"
		},
		connectedAccountPage: {
			formHint: "Selecciona un proveedor para conectar su cuenta.",
			formHint__noAccounts: "No hay proveedores de cuentas externas disponibles.",
			removeResource: {
				messageLine1: "{{identifier}} será eliminado de esta cuenta.",
				messageLine2: "Ya no podrás utilizar esta cuenta activa y las funciones dependientes ya no funcionarán.",
				successMessage: "{{connectedAccount}} ha sido eliminado de tu cuenta.",
				title: "Eliminar cuenta conectada"
			},
			socialButtonsBlockButton: "{{provider|titleize}}",
			successMessage: "El proveedor ha sido agregado a tu cuenta",
			title: "Agregar cuenta conectada"
		},
		deletePage: {
			actionDescription: "Escribe \"Eliminar cuenta\" a continuación para continuar",
			confirm: "Eliminar cuenta",
			messageLine1: "¿Está seguro de que desea eliminar su cuenta? Es posible que se conserven algunos datos asociados. Para solicitar la eliminación completa de datos, comuníquese con el soporte.",
			messageLine2: "Esta acción es permanente e irreversible.",
			title: "Eliminar cuenta"
		},
		emailAddressPage: {
			emailCode: {
				formHint: "A esta dirección de correo electrónico se le enviará un correo electrónico con un código de verificación.",
				formSubtitle: "Introduce el código de verificación enviado a {{identifier}}",
				formTitle: "Código de verificación",
				resendButton: "Reenviar código",
				successMessage: "El correo electrónico {{identifier}} se ha agregado a tu cuenta."
			},
			emailLink: {
				formHint: "Se enviará un correo electrónico con un enlace de verificación a esta dirección de correo electrónico.",
				formSubtitle: "Haz clic en el enlace de verificación en el correo electrónico enviado a {{identifier}}",
				formTitle: "Enlace de verificación",
				resendButton: "Reenviar enlace",
				successMessage: "El correo electrónico {{identifier}} se ha agregado a su cuenta."
			},
			enterpriseSSOLink: {
				formButton: "Click para iniciar sesión",
				formSubtitle: "Completar el inicio de sesión con {{identifier}}"
			},
			formHint: "Deberás verificar el correo electrónico antes de ser añadido a tu cuenta",
			removeResource: {
				messageLine1: "{{identifier}} será eliminado de esta cuenta.",
				messageLine2: "Ya no podrás iniciar sesión con esta dirección de correo electrónico.",
				successMessage: "{{emailAddress}} ha sido eliminado de tu cuenta.",
				title: "Eliminar dirección de correo electrónico"
			},
			title: "Agregar dirección de correo electrónico",
			verifyTitle: "Verificar dirección de correo electrónico"
		},
		formButtonPrimary__add: "Agregar",
		formButtonPrimary__continue: "Continuar",
		formButtonPrimary__finish: "Terminar",
		formButtonPrimary__remove: "Eliminar",
		formButtonPrimary__save: "Guardar",
		formButtonReset: "Cancelar",
		mfaPage: {
			formHint: "Seleccione un método para agregar.",
			title: "Agregar verificación en dos pasos"
		},
		mfaPhoneCodePage: {
			backButton: "Usar número existente",
			primaryButton__addPhoneNumber: "Agregar número de teléfono",
			removeResource: {
				messageLine1: "{{identifier}} dejará de recibir códigos de verificación al iniciar sesión.",
				messageLine2: "Es posible que tu cuenta no sea tan segura. ¿Estás seguro de que quieres continuar?",
				successMessage: "Se eliminó la verificación de dos pasos por SMS para {{mfaPhoneCode}}",
				title: "Eliminar la verificación en dos pasos"
			},
			subtitle__availablePhoneNumbers: "Selecciona un número de teléfono para registrar la verificación en dos pasos por SMS.",
			subtitle__unavailablePhoneNumbers: "No hay números de teléfono disponibles para registrar la verificación en dos pasos por SMS.",
			successMessage1: "Al iniciar sesión, se te solicitará un código de verificación enviado a este número de teléfono como un paso adicional.",
			successMessage2: "Guarda estos códigos de respaldo y almacénalos en un lugar seguro. Si pierdes el acceso a tu dispositivo de autenticación, puedes utilizar los códigos de respaldo para iniciar sesión.",
			successTitle: "Verificación por SMS habilitada",
			title: "Agregar verificación por SMS"
		},
		mfaTOTPPage: {
			authenticatorApp: {
				buttonAbleToScan__nonPrimary: "Escanea el código QR en su lugar",
				buttonUnableToScan__nonPrimary: "¿No puedes escanear el código QR?",
				infoText__ableToScan: "Configura un nuevo método de inicio de sesión en tu aplicación de autenticación y escanea el siguiente código QR para vincularlo a tu cuenta.",
				infoText__unableToScan: "Configura un nuevo método de inicio de sesión en tu autenticador e ingresa la clave que se proporciona a continuación.",
				inputLabel__unableToScan1: "Asegúrate de que las contraseñas de Un-Solo-Uso o Por-Tiempo estén habilitadas, luego finaliza la vinculación con tu cuenta.",
				inputLabel__unableToScan2: "Alternativamente, si tu autenticador admite URIs TOTP, también puedes copiar la URI completa."
			},
			removeResource: {
				messageLine1: "El código de verificación de este autenticador ya no será necesario al iniciar sesión.",
				messageLine2: "Es posible que tu cuenta no sea tan segura. ¿Estás seguro de que quieres continuar?",
				successMessage: "Se eliminó la verificación en dos pasos a través de la aplicación de autenticación.",
				title: "Eliminar la verificación en dos pasos"
			},
			successMessage: "La verificación en dos pasos ahora está habilitada. Al iniciar sesión, deberás ingresar un código de verificación de este autenticador como un paso adicional.",
			title: "Agregar aplicación de autenticación",
			verifySubtitle: "Ingresa el código de verificación generado por tu autenticador",
			verifyTitle: "Código de verificación"
		},
		mobileButton__menu: "Menú",
		navbar: {
			account: "Perfil",
			apiKeys: "Claves API",
			billing: "Facturación",
			description: "Administra la información de tu cuenta.",
			security: "Seguridad",
			title: "Cuenta"
		},
		passkeyScreen: {
			removeResource: {
				messageLine1: "{{name}} será eliminada de esta cuenta.",
				title: "Eliminar llave de acceso"
			},
			subtitle__rename: "Puedes cambiar el nombre de la llave de acceso para que sea más fácil de encontrar.",
			title__rename: "Renombrar llave de acceso"
		},
		passwordPage: {
			checkboxInfoText__signOutOfOtherSessions: "Se recomienda cerrar la sesión de todos los otros dispositivos que hayan utilizado su antigua contraseña.",
			readonly: "Tu contraseña no se puede editar actualmente porque solo se puede acceder a través de la conexión de empresa.",
			successMessage__set: "Se ha establecido tu contraseña.",
			successMessage__signOutOfOtherSessions: "Se cerró la sesión de todos los demás dispositivos.",
			successMessage__update: "Tu contraseña ha sido actualizada.",
			title__set: "Configurar contraseña",
			title__update: "Cambiar contraseña"
		},
		phoneNumberPage: {
			infoText: "Se enviará un mensaje de texto con un enlace de verificación a este número de teléfono.",
			removeResource: {
				messageLine1: "{{identifier}} será eliminado de esta cuenta.",
				messageLine2: "Ya no podrás iniciar sesión con este número de teléfono.",
				successMessage: "{{phoneNumber}} ha sido eliminado de tu cuenta.",
				title: "Eliminar número de teléfono"
			},
			successMessage: "{{identifier}} ha sido añadido a tu cuenta.",
			title: "Agregar el número de teléfono",
			verifySubtitle: "Ingresa el código de verificación enviado a {{identifier}}",
			verifyTitle: "Verificar número de teléfono"
		},
		plansPage: { title: void 0 },
		profilePage: {
			fileDropAreaHint: "Carga una imagen JPG, PNG, GIF o WEBP de menos de 10 MB",
			imageFormDestructiveActionSubtitle: "Eliminar la imagen",
			imageFormSubtitle: "Cargar imagen",
			imageFormTitle: "Imagen de perfil",
			readonly: "Tu información de perfil ha sido proporcionada por la conexión de empresa y no se puede editar.",
			successMessage: "Tu perfil ha sido actualizado.",
			title: "Actualizar perfil"
		},
		start: {
			activeDevicesSection: {
				destructiveAction: "Cerrar sesión en el dispositivo",
				title: "Dispositivos activos"
			},
			connectedAccountsSection: {
				actionLabel__connectionFailed: "Inténtelo nuevamente",
				actionLabel__reauthorize: "Autorizar ahora",
				destructiveActionTitle: "Quitar",
				primaryButton: "Conectar cuenta",
				subtitle__disconnected: "Esta cuenta ha sido desconectada.",
				subtitle__reauthorize: "Los permisos requeridos han sido actualizados, y podrías experimentar limitaciones. Por favor, autoriza de nuevo esta aplicación para evitar cualquier problema",
				title: "Cuentas conectadas"
			},
			dangerSection: {
				deleteAccountButton: "Eliminar cuenta",
				title: "Eliminar cuenta"
			},
			emailAddressesSection: {
				destructiveAction: "Eliminar correo electrónico",
				detailsAction__nonPrimary: "Establecer como primario",
				detailsAction__primary: "Completar verificación",
				detailsAction__unverified: "Completar verificación",
				primaryButton: "Agregar correo electrónico",
				title: "Correos electrónicos"
			},
			enterpriseAccountsSection: {
				primaryButton: "Conectar cuenta",
				title: "Cuentas de empresa"
			},
			headerTitle__account: "Detalles de la cuenta",
			headerTitle__security: "Seguridad",
			mfaSection: {
				backupCodes: {
					actionLabel__regenerate: "Regenerar",
					headerTitle: "Códigos de respaldo",
					subtitle__regenerate: "Obtén un nuevo conjunto de códigos de respaldo seguros. Los códigos de respaldo anteriores se eliminarán y no podrán ser utilizados.",
					title__regenerate: "Regenerar códigos de respaldo"
				},
				phoneCode: {
					actionLabel__setDefault: "Establecer como predeterminado",
					destructiveActionLabel: "Eliminar número telefónico"
				},
				primaryButton: "Añadir verificación de dos pasos",
				title: "Verificación de dos pasos",
				totp: {
					destructiveActionTitle: "Eliminar",
					headerTitle: "Aplicación de autenticación"
				}
			},
			passkeysSection: {
				menuAction__destructive: "Eliminar",
				menuAction__rename: "Renombrar",
				primaryButton: "Añadir llave de acceso",
				title: "Llaves de acceso"
			},
			passwordSection: {
				primaryButton__setPassword: "Establecer contraseña ",
				primaryButton__updatePassword: "Cambiar contraseña",
				title: "Contraseña"
			},
			phoneNumbersSection: {
				destructiveAction: "Eliminar número telefónico",
				detailsAction__nonPrimary: "Establecer como primario",
				detailsAction__primary: "Completar la verificación",
				detailsAction__unverified: "Completar la verificación",
				primaryButton: "Agregar un número telefónico",
				title: "Números telefónicos"
			},
			profileSection: {
				primaryButton: "Actualizar perfil",
				title: "Perfil"
			},
			usernameSection: {
				primaryButton__setUsername: "Definir nombre de usuario",
				primaryButton__updateUsername: "Cambiar nombre de usuario",
				title: "Nombre de usuario"
			},
			web3WalletsSection: {
				destructiveAction: "Quitar billetera",
				detailsAction__nonPrimary: "Establecer como primaria",
				primaryButton: "Conectar billetera",
				title: "Billeteras Web3",
				web3SelectSolanaWalletScreen: {
					subtitle: "Selecciona una billetera de Solana para conectarla a tu cuenta.",
					title: "Agregar una billetera de Solana"
				}
			}
		},
		usernamePage: {
			successMessage: "Tu nombre de usuario ha sido actualizado.",
			title__set: "Actualizar nombre de usuario",
			title__update: "Actualizar nombre de usuario"
		},
		web3WalletPage: {
			removeResource: {
				messageLine1: "{{identifier}} será eliminado de esta cuenta.",
				messageLine2: "Ya no podrás iniciar sesión con esta billetera web3.",
				successMessage: "{{web3Wallet}} ha sido eliminado de tu cuenta.",
				title: "Eliminar la billetera web3"
			},
			subtitle__availableWallets: "Selecciona una billetera web3 para conectarse a tu cuenta.",
			subtitle__unavailableWallets: "No hay billeteras web3 disponibles.",
			successMessage: "La billetera ha sido agregada a tu cuenta.",
			title: "Añadir billetera web3",
			web3WalletButtonsBlockButton: "{{provider|titleize}}"
		}
	},
	waitlist: {
		start: {
			actionLink: "Iniciar sesión",
			actionText: "¿Tienes una cuenta?",
			formButton: "Únete a la lista de espera",
			subtitle: "Ingresa tu correo electrónico y te avisaremos cuando tú lugar esté listo",
			title: "Únete a la lista de espera"
		},
		success: {
			message: "Serás redirigido pronto...",
			subtitle: "Nos pondremos en contacto contigo cuando tu lugar esté listo",
			title: "¡Gracias por unirte a la lista de espera!"
		}
	},
	web3SolanaWalletButtons: {
		connect: "Conectar con {{walletName}}",
		continue: "Continuar con {{walletName}}",
		noneAvailable: "No se detectaron billeteras Web3 de Solana. Instala una {{ solanaWalletsLink || link(\"wallet extension\") }} compatible con Web3."
	}
};

//#endregion
export { esMX };
