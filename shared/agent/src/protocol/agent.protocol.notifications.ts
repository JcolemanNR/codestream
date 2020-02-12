"use strict";
import { NotificationType, TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { Document } from "./agent.protocol";
import { LoginSuccessResponse, TokenLoginRequest } from "./agent.protocol.auth";
import { CodemarkPlus } from "./agent.protocol.codemarks";
import { ThirdPartyProviders } from "./agent.protocol.providers";
import {
	CSApiCapabilities,
	CSCompany,
	CSLastReads,
	CSMarker,
	CSMarkerLocations,
	CSMePreferences,
	CSPost,
	CSRepository,
	CSReview,
	CSStream,
	CSTeam,
	CSUser
} from "./api.protocol";

export interface RestartRequiredNotification {}

export const RestartRequiredNotificationType = new NotificationType<
	RestartRequiredNotification,
	void
>("codestream/restartRequired");

export enum ConnectionStatus {
	Disconnected = "disconnected",
	Reconnected = "reconnected",
	Reconnecting = "reconnecting"
}

export interface DidChangeConnectionStatusNotification {
	reset?: boolean;
	status: ConnectionStatus;
}

export const DidChangeConnectionStatusNotificationType = new NotificationType<
	DidChangeConnectionStatusNotification,
	void
>("codestream/didChangeConnectionStatus");

export enum ChangeDataType {
	Codemarks = "codemarks",
	Commits = "commits",
	Companies = "companies",
	Documents = "documents",
	MarkerLocations = "markerLocations",
	Markers = "markers",
	Posts = "posts",
	Preferences = "preferences",
	Repositories = "repos",
	Reviews = "reviews",
	Streams = "streams",
	Teams = "teams",
	Unreads = "unreads",
	Users = "users",
	Providers = "providers",
	ApiCapabilities = "apiCapabilities"
}

export interface CodemarksChangedNotification {
	type: ChangeDataType.Codemarks;
	data: CodemarkPlus[];
}

export interface CompaniesChangedNotification {
	type: ChangeDataType.Companies;
	data: CSCompany[];
}

export interface MarkerLocationsChangedNotification {
	type: ChangeDataType.MarkerLocations;
	data: CSMarkerLocations[];
}

export interface MarkersChangedNotification {
	type: ChangeDataType.Markers;
	data: CSMarker[];
}

export interface PostsChangedNotification {
	type: ChangeDataType.Posts;
	data: CSPost[];
}

export interface PreferencesChangedNotification {
	type: ChangeDataType.Preferences;
	data: CSMePreferences;
}

export interface RepositoriesChangedNotification {
	type: ChangeDataType.Repositories;
	data: CSRepository[];
}

export interface ReviewsChangedNotification {
	type: ChangeDataType.Reviews;
	data: CSReview[];
}

export interface StreamsChangedNotification {
	type: ChangeDataType.Streams;
	data: CSStream[];
}

export interface TeamsChangedNotification {
	type: ChangeDataType.Teams;
	data: CSTeam[];
}

export interface Unreads {
	lastReads: CSLastReads;
	mentions: { [streamId: string]: number };
	unreads: { [streamId: string]: number };
	totalMentions: number;
	totalUnreads: number;
}

export interface UnreadsChangedNotification {
	type: ChangeDataType.Unreads;
	data: Unreads;
}

export interface UsersChangedNotification {
	type: ChangeDataType.Users;
	data: CSUser[];
}

export interface ProvidersChangedNotification {
	type: ChangeDataType.Providers;
	data: ThirdPartyProviders;
}

export interface ApiCapabilitiesChangedNotification {
	type: ChangeDataType.ApiCapabilities;
	data: CSApiCapabilities;
}

export interface DocumentData {
	reason: "saved" | "changed" | "removed";
	document: Document;
}

export interface DocumentsChangedNotification {
	type: ChangeDataType.Documents;
	data: DocumentData;
}

export interface CommitsChangedNotification {
	type: ChangeDataType.Commits;
	// at this point it doesn't really matter what the payload is -- it's unused
	data: any;
}

export type DidChangeDataNotification =
	| CodemarksChangedNotification
	| CompaniesChangedNotification
	| MarkerLocationsChangedNotification
	| MarkersChangedNotification
	| PostsChangedNotification
	| PreferencesChangedNotification
	| RepositoriesChangedNotification
	| ReviewsChangedNotification
	| StreamsChangedNotification
	| TeamsChangedNotification
	| UnreadsChangedNotification
	| UsersChangedNotification
	| ProvidersChangedNotification
	| ApiCapabilitiesChangedNotification
	| DocumentsChangedNotification
	| CommitsChangedNotification;

export const DidChangeDataNotificationType = new NotificationType<DidChangeDataNotification, void>(
	"codestream/didChangeData"
);

export interface DidChangeDocumentMarkersNotification {
	textDocument: TextDocumentIdentifier;
	reason: "document" | "codemarks";
}

export const DidChangeDocumentMarkersNotificationType = new NotificationType<
	DidChangeDocumentMarkersNotification,
	void
>("codestream/didChangeDocumentMarkers");

export enum VersionCompatibility {
	Compatible = "ok",
	CompatibleUpgradeAvailable = "outdated",
	CompatibleUpgradeRecommended = "deprecated",
	UnsupportedUpgradeRequired = "incompatible",
	Unknown = "unknownVersion"
}

export interface DidChangeVersionCompatibilityNotification {
	compatibility: VersionCompatibility;
	downloadUrl: string;
	version: string | undefined;
}

export const DidChangeVersionCompatibilityNotificationType = new NotificationType<
	DidChangeVersionCompatibilityNotification,
	void
>("codestream/didChangeVersionCompatibility");

export enum ApiVersionCompatibility {
	ApiCompatible = "apiCompatible",
	ApiUpgradeRecommended = "apiUpgradeRecommended",
	ApiUpgradeRequired = "apiUpgradeRequired"
}

export interface DidChangeApiVersionCompatibilityNotification {
	compatibility: ApiVersionCompatibility;
	version: string;
	missingCapabilities?: CSApiCapabilities;
}

export const DidChangeApiVersionCompatibilityNotificationType = new NotificationType<
	DidChangeApiVersionCompatibilityNotification,
	void
>("codestream/didChangeApiVersionCompatibility");

export enum LogoutReason {
	Token = "token",
	Unknown = "unknown",
	UnsupportedVersion = "unsupportedVersion",
	UnsupportedApiVersion = "unsupportedApiVersion"
}

export interface DidLogoutNotification {
	reason: LogoutReason;
}

export const DidLogoutNotificationType = new NotificationType<DidLogoutNotification, void>(
	"codestream/didLogout"
);

export interface DidLoginNotification {
	data: LoginSuccessResponse;
}
export const DidLoginNotificationType = new NotificationType<DidLoginNotification, void>(
	"codestream/didLogin"
);

export const DidStartLoginNotificationType = new NotificationType<void, void>(
	"codestream/didStartLogin"
);

export const DidFailLoginNotificationType = new NotificationType<void, void>(
	"codestream/didFailLogin"
);

export type DidEncounterMaintenanceModeNotification = TokenLoginRequest;

export const DidEncounterMaintenanceModeNotificationType = new NotificationType<
	DidEncounterMaintenanceModeNotification,
	void
>("codestream/didEncounterMaintenanceMode");
