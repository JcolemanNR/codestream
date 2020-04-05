import React, { useState, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import CancelButton from "./CancelButton";
import { CodeStreamState } from "../store";
import { HostApi } from "../webview-api";
import { Button } from "../src/components/Button";
import styled from "styled-components";
import { ButtonRow } from "./ChangeUsernamePanel";
import { UpdateUserRequestType } from "../protocols/agent/agent.protocol.users";
import { logError } from "../logger";
import { FormattedMessage } from "react-intl";
import { CSMe } from "@codestream/protocols/api";
import cx from "classnames";
import { Link } from "./Link";
import { TextInput } from "../Authentication/TextInput";
import { isEmailValid } from "../Authentication/Signup";
import { RegisterUserRequestType, GetUserInfoRequestType } from "@codestream/protocols/agent";
import { CSText } from "../src/components/CSText";
import { useDidMount } from "../utilities/hooks";

const Root = styled.div`
	#controls {
		padding-top: 10px;
	}
`;

const defaultArrayLength = 6;
const array = new Array(defaultArrayLength);
const initialValues: string[] = [...array].fill("");

export const ChangeEmailPanel = props => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const currentUser = state.users[state.session.userId!] as CSMe;
		return { currentEmail: currentUser.email };
	});
	const inputs = useRef(array);
	const [loading, setLoading] = useState(false);
	const [email, setEmail] = useState(derivedState.currentEmail);
	const [emailValidity, setEmailValidity] = useState(true);
	const [unexpectedError, setUnexpectedError] = useState(false);
	const [formInvalid, setFormInvalid] = useState(false);
	const [pendingChange, setPendingChange] = useState(false);
	const [digits, setValues] = useState(initialValues);
	const [error, setError] = useState();
	const [emailSent, setEmailSent] = useState(false);
	const [scmEmail, setScmEmail] = useState("");

	useDidMount(() => {
		const getUserInfo = async () => {
			const response = await HostApi.instance.send(GetUserInfoRequestType, {});
			setScmEmail(response.email || "");
		};
		getUserInfo();
	});

	const onValidityChanged = useCallback((field: string, validity: boolean) => {
		switch (field) {
			case "email":
				setEmailValidity(validity);
				break;
			default: {
			}
		}
	}, []);

	const onSubmit = async (event: React.SyntheticEvent) => {
		setUnexpectedError(false);
		event.preventDefault();
		onValidityChanged("email", isEmailValid(email));
		if (!emailValidity) return;

		setLoading(true);
		try {
			await HostApi.instance.send(UpdateUserRequestType, { email });
			HostApi.instance.track("Email Change Request", {});
			setPendingChange(true);
			// props.closePanel();
		} catch (error) {
			logError(`Unexpected error during change email: ${error}`, { email });
			setUnexpectedError(true);
		}
		// @ts-ignore
		setLoading(false);
	};

	const onSubmitConfirm = async (event?: React.SyntheticEvent) => {
		setUnexpectedError(false);
		if (event) event.preventDefault();
		onValidityChanged("email", isEmailValid(email));
		if (!emailValidity) return;

		setLoading(true);
		try {
			await HostApi.instance.send(UpdateUserRequestType, { email });
			HostApi.instance.track("Email Change Request", {});
			setPendingChange(true);
			// props.closePanel();
		} catch (error) {
			logError(`Unexpected error during change email: ${error}`, { email });
			setUnexpectedError(true);
		}
		// @ts-ignore
		setLoading(false);
	};

	const onClickSendEmail = useCallback(
		async (event: React.MouseEvent) => {
			event.preventDefault();
			setEmailSent(false);
			await HostApi.instance.send(RegisterUserRequestType, { email, username: "", password: "" });
			setEmailSent(true);
		},
		[email]
	);

	const renderChangeEmail = () => {
		return (
			<>
				{" "}
				<h3>Change Email</h3>
				<div id="controls">
					<div className="small-spacer" />
					{unexpectedError && (
						<div className="error-message form-error">
							<FormattedMessage
								id="error.unexpected"
								defaultMessage="Something went wrong! Please try again, or "
							/>
							<FormattedMessage id="contactSupport" defaultMessage="contact support">
								{text => <Link href="https://help.codestream.com">{text}</Link>}
							</FormattedMessage>
							.
						</div>
					)}
					<div className="control-group">
						{scmEmail && scmEmail !== derivedState.currentEmail && (
							<div style={{ fontSize: "smaller" }}>
								<CSText as="span">
									Your CodeStream and git commit emails don't match (
									<b>{derivedState.currentEmail}</b> vs. <b>{scmEmail}</b>), which impairs
									CodeStream's ability to identify which commits are yours. Please either update
									your gitconfig or set your CodeStream email to match.
									<br />
									<br />
								</CSText>
							</div>
						)}
						<label>Email</label>
						<TextInput
							name="Email"
							value={email}
							autoFocus
							onChange={setEmail}
							onValidityChanged={onValidityChanged}
							validate={isEmailValid}
						/>
						{!emailValidity && (
							<small className="explainer error-message">
								<FormattedMessage id="signUp.email.invalid" />
							</small>
						)}
						<ButtonRow>
							<Button onClick={onSubmit} isLoading={loading}>
								Save Email
							</Button>
						</ButtonRow>
					</div>
				</div>
			</>
		);
	};

	const nativeProps = {
		min: 0,
		maxLength: "1"
	};

	const renderConfirmEmail = () => {
		return (
			<>
				{" "}
				<h3>Confirm Email</h3>
				<div id="controls">
					<div className="small-spacer" />
					{unexpectedError && (
						<div className="error-message form-error">
							<FormattedMessage
								id="error.unexpected"
								defaultMessage="Something went wrong! Please try again, or "
							/>
							<FormattedMessage id="contactSupport" defaultMessage="contact support">
								{text => <Link href="https://help.codestream.com">{text}</Link>}
							</FormattedMessage>
							.
						</div>
					)}
					<FormattedMessage id="confirmation.instructions" tagName="p" />
					<FormattedMessage id="confirmation.didNotReceive">
						{text => (
							<p>
								{text}{" "}
								<FormattedMessage id="confirmation.sendAnother">
									{text => <Link onClick={onClickSendEmail}>{text}</Link>}
								</FormattedMessage>
								. {emailSent && <strong>Email sent!</strong>}
							</p>
						)}
					</FormattedMessage>
					<div className="control-group">
						<div className="confirmation-code">
							{digits.map((digit, index) => (
								<TextInput
									ref={element => (inputs.current[index] = element)}
									key={index}
									value={digit}
									type="number"
									nativeProps={nativeProps}
									onPaste={event => {
										event.preventDefault();
										const string = event.clipboardData.getData("text").trim();
										if (string === "" || Number.isNaN(parseInt(string, 10))) return;
										if (string.length !== defaultArrayLength) return;

										setValues(string.split(""));
									}}
									onChange={value => {
										setError(undefined);
										let newDigit: string;
										// probably a backspace
										if (value === "") newDigit = value;
										// don't change the value
										else if (Number.isNaN(Number(value))) newDigit = digit;
										// make sure to take the last character in case of changing a value
										else newDigit = value.charAt(value.length - 1);

										const newDigits = digits.slice();
										newDigits.splice(index, 1, newDigit);
										setValues(newDigits);
										if (value === "") return;
										const nextInput = inputs.current[index + 1];
										if (nextInput) nextInput.focus();
										else onSubmitConfirm();
									}}
								/>
							))}
						</div>
						<ButtonRow>
							<Button onClick={onSubmitConfirm} isLoading={loading}>
								Confirm Email
							</Button>
						</ButtonRow>
					</div>
				</div>
			</>
		);
	};

	return (
		<Root className="full-height-panel onboarding-page" style={{ padding: 0 }}>
			<form className="standard-form vscroll">
				<div className="panel-header">
					<CancelButton onClick={props.closePanel} />
				</div>
				<fieldset className="form-body" style={{ width: "18em" }}>
					<div className="outline-box">
						{pendingChange ? renderConfirmEmail() : renderChangeEmail()}
					</div>
				</fieldset>
			</form>
		</Root>
	);
};
