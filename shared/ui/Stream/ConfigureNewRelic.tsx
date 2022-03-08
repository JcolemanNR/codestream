import {
	GetNewRelicSignupJwtTokenRequestType,
	GetReposScmRequestType,
	RepoProjectType
} from "@codestream/protocols/agent";
import { OpenUrlRequestType, WebviewPanels } from "@codestream/protocols/webview";
import React, { Component } from "react";
import { connect } from "react-redux";
import { closeAllPanels, setWantNewRelicOptions } from "../store/context/actions";
import { configureProvider } from "../store/providers/actions";
import { isConnected } from "../store/providers/reducer";
import { isCurrentUserInternal } from "../store/users/reducer";
import { HostApi } from "../webview-api";
import { openPanel } from "./actions";
import Button from "./Button";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";
import Icon from "./Icon";
import { Link } from "./Link";

interface Props {
	isNewRelicConnected?: boolean;
	isInternalUser?: boolean;
	showSignupUrl: boolean;
	disablePostConnectOnboarding?: boolean;
	providerId: string;
	originLocation?:
		| "Integrations Panel"
		| "Open in IDE Flow"
		| "Open in IDE Pixie"
		| "Observability Section"
		| "Pixie Logging";
	headerChildren?: any;
	providers?: any;
	ide: {
		name: string;
	};
	isProductionCloud?: boolean;
	newRelicApiUrl?: string;
	closeAllPanels: Function;
	configureProvider: Function;
	onClose?: Function;
	onSubmited?: Function;
	setWantNewRelicOptions: Function;
	openPanel: Function;
}

class ConfigureNewRelic extends Component<Props> {
	initialState = {
		loading: false,
		apiKey: "",
		apiKeyTouched: false,
		formTouched: false,
		showSignupUrl: true,
		disablePostConnectOnboarding: false,
		error: null
	};

	state = this.initialState;

	componentDidMount() {
		if (this.props.isNewRelicConnected) {
			this.props.closeAllPanels();
		}
		const el = document.getElementById("configure-provider-initial-input");
		el && el.focus();
	}

	componentDidUpdate(prevProps, prevState) {
		// automatically close the panel
		if (this.props.isNewRelicConnected && !prevProps.isNewRelicConnected && !this.state.apiKey) {
			this.props.closeAllPanels();
		}
	}

	onSubmit = async e => {
		e.preventDefault();
		if (this.isFormInvalid()) return;
		let isOnSubmittedPromise = false;
		const { providerId } = this.props;
		const { apiKey } = this.state;
		const apiUrl: string | undefined = this.props.isProductionCloud
			? this.props.newRelicApiUrl || "https://api.newrelic.com"
			: "https://staging-api.newrelic.com";

		// configuring is as good as connecting, since we are letting the user
		// set the access token ... sending the fourth argument as true here lets the
		// configureProvider function know that they can mark New Relic as connected as soon
		// as the access token entered by the user has been saved to the server
		this.setState({ loading: true });
		try {
			await this.props.configureProvider(
				providerId,
				{ apiKey, apiUrl },
				true,
				this.props.originLocation,
				true
			);
			this.setState({ error: undefined });

			HostApi.instance.track("NR Connected", {
				"Connection Location": this.props.originLocation
			});
			if (this.props.onSubmited) {
				const result = this.props.onSubmited(e);
				if (typeof result?.then === "function") {
					isOnSubmittedPromise = true;
					result.then(_ => {
						this.setState({ loading: false });
					});
				}
			}
			if (!this.props.disablePostConnectOnboarding) {
				const reposResponse = await HostApi.instance.send(GetReposScmRequestType, {
					inEditorOnly: true,
					guessProjectTypes: true
				});
				if (!reposResponse.error) {
					const knownRepo = (reposResponse.repositories || []).find(repo => {
						return repo.id && repo.projectType !== RepoProjectType.Unknown;
					});
					if (knownRepo) {
						this.props.setWantNewRelicOptions(
							knownRepo.projectType,
							knownRepo.id,
							knownRepo.path,
							knownRepo.projects
						);
						this.props.openPanel(WebviewPanels.OnboardNewRelic);
					}
				}
			}
		} catch (ex) {
			this.setState({ error: ex.message, loading: false });
		}
		if (!isOnSubmittedPromise) {
			this.setState({ loading: false });
		}
	};

	renderError = () => {
		if (this.state.error) {
			return <small className="error-message">{this.state.error}</small>;
		}
	};

	onBlurApiKey = () => {
		this.setState({ apiKeyTouched: true });
	};

	renderApiKeyHelp = () => {
		const { apiKey, apiKeyTouched, formTouched } = this.state;
		if (apiKeyTouched || formTouched)
			if (apiKey.length === 0) return <small className="error-message">Required</small>;
	};

	isFormInvalid = () => {
		return this.state.apiKey.length === 0;
	};

	onClickSignup = async campaign => {
		const { token, baseLandingUrl } = await HostApi.instance.send(
			GetNewRelicSignupJwtTokenRequestType,
			{}
		);
		const url =
			`${baseLandingUrl}/codestream/signup` +
			`?token=${token}` +
			`&utm_source=codestream` +
			`&utm_medium=${this.props.ide.name}` +
			`&utm_campaign=${campaign}`;
		void HostApi.instance.send(OpenUrlRequestType, { url });
	};

	render() {
		if (this.props.isNewRelicConnected) {
			return null;
		}
		const { providerId, headerChildren, showSignupUrl } = this.props;
		const { name } = this.props.providers[providerId] || {};
		const providerName = PROVIDER_MAPPINGS[name] ? PROVIDER_MAPPINGS[name].displayName : "";
		const getUrl = PROVIDER_MAPPINGS[name] ? PROVIDER_MAPPINGS[name].getUrl : "";
		return (
			<div className="standard-form vscroll">
				{headerChildren}

				<fieldset className="form-body">
					{showSignupUrl && getUrl && (
						<p style={{ textAlign: "center" }} className="explainer">
							Not a {providerName} customer yet? <a href={getUrl}>Get {providerName}</a>
						</p>
					)}
					{this.renderError()}
					<div id="controls">
						<div id="token-controls" className="control-group">
							<div className="control-group">
								<label>Already have a {providerName} User API Key?</label>
								<div
									style={{
										width: "100%",
										display: "flex",
										alignItems: "stretch"
									}}
								>
									<div style={{ position: "relative", flexGrow: 10 }}>
										<input
											id="configure-provider-initial-input"
											className="input-text control"
											type="password"
											name="apiKey"
											tabIndex={1}
											autoFocus
											value={this.state.apiKey}
											onChange={e => this.setState({ apiKey: e.target.value })}
											onBlur={this.onBlurApiKey}
											required={this.state.apiKeyTouched || this.state.formTouched}
										/>
										{this.renderApiKeyHelp()}
									</div>
								</div>
								<div className="control-group" style={{ margin: "15px 0px" }}>
									<Button
										id="save-button"
										tabIndex={2}
										style={{ marginTop: "0px" }}
										className="row-button"
										onClick={this.onSubmit}
										loading={this.state.loading}
									>
										<Icon name="newrelic" />
										<div className="copy"> Connect to New Relic One</div>
										<Icon name="chevron-right" />
									</Button>
								</div>
								<div>
									Don't have an API key?{" "}
									<Link
										onClick={e => {
											e.preventDefault();
											HostApi.instance.track("NR Get API Key");
											this.onClickSignup("nr_getapikey");
										}}
									>
										Create one now
									</Link>
								</div>
							</div>
						</div>
						<div className="control-group" style={{ marginTop: "30px" }}>
							<div>Don't have a {providerName} account?</div>
							<div>
								<Button
									style={{ marginTop: "5px" }}
									className="row-button"
									onClick={e => {
										e.preventDefault();
										HostApi.instance.track("NR Signup Initiated");
										this.onClickSignup("nr_signup");
									}}
								>
									<Icon name="newrelic" />
									<div className="copy">Sign Up for New Relic One</div>
									<Icon name="chevron-right" />
								</Button>
							</div>
						</div>
					</div>
				</fieldset>
			</div>
		);
	}
}

const mapStateToProps = state => {
	const { providers, ide } = state;
	const connected = isConnected(state, { id: "newrelic*com" });
	return {
		isProductionCloud: state.configs.isProductionCloud,
		newRelicApiUrl: state.configs.newRelicApiUrl,
		providers,
		ide,
		isNewRelicConnected: connected
	};
};

const component = connect(mapStateToProps, {
	isConnected,
	closeAllPanels,
	configureProvider,
	openPanel,
	setWantNewRelicOptions
})(ConfigureNewRelic);

export { component as ConfigureNewRelic };
