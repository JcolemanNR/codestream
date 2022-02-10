"use strict";
import { GitRemoteLike, GitRepository } from "git/gitService";
import * as paths from "path";
import * as qs from "querystring";
import { URI } from "vscode-uri";
import { SessionContainer } from "../container";
import { toRepoName } from "../git/utils";
import { Logger } from "../logger";
import {
	DocumentMarker,
	ProviderConfigurationData,
	ProviderGetForkedReposResponse
} from "../protocol/agent.protocol";
import { CSBitbucketProviderInfo } from "../protocol/api.protocol";
import { log, lspProvider, Strings } from "../system";
import {
	getRemotePaths,
	ProviderCreatePullRequestRequest,
	ProviderCreatePullRequestResponse,
	ProviderGetRepoInfoResponse,
	ProviderPullRequestInfo,
	PullRequestComment,
	REFRESH_TIMEOUT,
	ThirdPartyIssueProviderBase
} from "./provider";

interface BitbucketRepo {
	uuid: string;
	full_name: string;
	path: string;
	owner: {
		uuid: string;
		username: string;
		type: string;
	};
	has_issues: boolean;
}

interface BitbucketServerRepo {
	id: string;
	name: string;
	path: string;
}

/*
interface BitbucketPermission {
	permission: string;
	repository: BitbucketRepo;
}
*/

interface BitbucketUser {
	uuid: string;
	display_name: string;
	account_id: string;
}

interface BitbucketValues<T> {
	values: T;
	isLastPage?: boolean;
	nextPageStart?: number;
}

interface BitbucketPullRequest {
	id: number;
	title: string;
	state: string;
	destination: {
		branch: {
			name: string;
		};
	};
	source: {
		branch: {
			name: string;
		};
	};
	links: {
		html: { href: string };
		comments: {
			href: string;
		};
	};
}

interface BitbucketPullRequestComment {
	id: string;
	user: {
		account_id: string;
		nickname: string;
	};
	content: {
		raw: string;
	};
	created_on: string;
	links: { html: { href: string }; code: { href: string } };
	inline: {
		to?: number;
		from?: number;
		outdated?: boolean;
		path: string;
	};
	pullrequest: {
		id: number;
		title: string;
		links: {
			html: {
				href: string;
			};
		};
	};
}

interface GetPullRequestsResponse extends BitbucketValues<BitbucketPullRequest[]> {}

interface GetPullRequestCommentsResponse extends BitbucketValues<BitbucketPullRequestComment[]> {}

/**
 * BitBucket provider
 * @see https://developer.atlassian.com/bitbucket/api/2/reference/
 */
@lspProvider("bitbucket_server")
export class BitbucketServerProvider extends ThirdPartyIssueProviderBase<CSBitbucketProviderInfo> {
	/*implements ThirdPartyProviderSupportsIssues, ThirdPartyProviderSupportsPullRequests*/
	// private _bitbucketUserId: string | undefined;
	private _knownRepos = new Map<string, BitbucketServerRepo>();
	private _repos: BitbucketServerRepo[] = [];

	get displayName() {
		return "Bitbucket Server";
	}

	get name() {
		return "bitbucket_server";
	}

	get apiPath() {
		return "/rest/api/1.0";
	}

	get baseUrl() {
		return `${this._providerInfo?.data?.baseUrl}${this.apiPath}`;
	}

	get headers() {
		return {
			Authorization: `Bearer ${this.accessToken}`,
			"Content-Type": "application/json"
		};
	}

	protected getPRExternalContent(comment: PullRequestComment) {
		return {
			provider: {
				name: this.displayName,
				icon: this.name,
				id: this.providerConfig.id
			},
			subhead: `#${comment.pullRequest.id}`,
			actions: [
				{
					label: "Open Comment",
					uri: comment.url
				},
				{
					label: `Open Merge Request #${comment.pullRequest.id}`,
					uri: comment.pullRequest.url
				}
			]
		};
	}

	@log()
	async configure(request: ProviderConfigurationData) {
		await this.session.api.setThirdPartyProviderToken({
			providerId: this.providerConfig.id,
			host: request.host,
			token: request.token,
			data: {
				baseUrl: request.baseUrl
			}
		});
		this.session.updateProviders();
	}

	async onConnected(providerInfo?: CSBitbucketProviderInfo) {
		super.onConnected(providerInfo);
		// this._bitbucketUserId = await this.getMemberId();
		this._knownRepos = new Map<string, BitbucketServerRepo>();
	}

	getRepoByPath(path: string) {
		const parts = path.split("/");
		if (parts.length > 1) {
			return this.get<BitbucketServerRepo>(`/projects/${parts[0]}/repos/${parts[1]}`);
		} else {
			throw new Error("improper bitbucket path");
		}
	}

	@log()
	async getPullRequestDocumentMarkers({
		uri,
		repoId,
		streamId
	}: {
		uri: URI;
		repoId: string | undefined;
		streamId: string;
	}): Promise<DocumentMarker[]> {
		return super.getPullRequestDocumentMarkersCore({ uri, repoId, streamId });
	}

	async getRemotePaths(repo: any, _projectsByRemotePath: any) {
		// TODO don't need this ensureConnected -- doesn't hit api
		await this.ensureConnected();
		const remotePaths = await getRemotePaths(
			repo,
			this.getIsMatchingRemotePredicate(),
			_projectsByRemotePath
		);
		return remotePaths;
	}

	protected getOwnerFromRemote(remote: string): { owner: string; name: string } {
		// HACKitude yeah, sorry
		const uri = URI.parse(remote);
		const split = uri.path.split("/");
		// BBS seems to default to "scm" as the first part aka /scm/foo/bar.git
		// but there's a product called "Kantega SSO Enterprise" which utilizes https+sso for checkouts,
		//

		// https://kantega-sso.atlassian.net/wiki/spaces/KSE/pages/1802357/FAQ+-+Frequently+Asked+Questions
		// Does Kerberos single sign-on work with Bitbucket clients?
		// Yes, single sign-on using Kerberos can be configured also for Git clients.
		// There is an option to enable Kerberos on the common /scm/* path and an alternative path.
		// Enabling this will allow Git clients to clone from the alternate,
		// Kerberos-enabled path /kerberos-scm/*
		if (split[1] === "scm" || split[1] === "kerberos-scm") {
			const owner = split[2];
			const name = toRepoName(split[3]);
			return {
				owner,
				name
			};
		} else if (split.length > 4 && split[1] === "bitbucket" && split[2] === "scm") {
			// https://trello.com/c/qmGVBexf - has a case where path seems to be like:
			// bitbucket/scm/owner/repo.git ... speculation is that where multiple atlassian
			// services are present, this part of the path distinguishes them
			const owner = split[3];
			const name = toRepoName(split[4]);
			return { owner, name };
		}

		const owner = split[1];
		const name = toRepoName(split[2]);
		return {
			owner,
			name
		};
	}

	async createPullRequest(
		request: ProviderCreatePullRequestRequest
	): Promise<ProviderCreatePullRequestResponse | undefined> {
		void (await this.ensureConnected());

		try {
			const repoInfo = await this.getRepoInfo({ remote: request.remote });
			if (repoInfo && repoInfo.error) {
				return {
					error: repoInfo.error
				};
			}
			const { owner, name } = this.getOwnerFromRemote(request.remote);
			const createPullRequestResponse = await this.post<
				BitbucketServerCreatePullRequestRequest,
				BitbucketServerCreatePullRequestResponse
			>(`/projects/${owner}/repos/${name}/pull-requests`, {
				fromRef: {
					id: request.headRefName,
					repository: {
						project: {
							key: repoInfo.key!
						},
						slug: name
					}
				},
				toRef: {
					id: request.baseRefName,
					repository: {
						project: {
							key: repoInfo.key!
						},
						slug: name
					}
				},
				title: request.title,
				description: this.createDescription(request)
			});

			const title = `#${createPullRequestResponse.body.id} ${createPullRequestResponse.body.title}`;
			return {
				url:
					createPullRequestResponse.body.links.self &&
					createPullRequestResponse.body.links.self.length
						? createPullRequestResponse.body.links.self[0].href
						: undefined,
				title: title
			};
		} catch (ex) {
			Logger.error(ex, `${this.displayName}: createPullRequest`, {
				remote: request.remote,
				head: request.headRefName,
				base: request.baseRefName
			});

			return {
				error: {
					type: "PROVIDER",
					message: `${this.displayName}: ${ex.message}`
				}
			};
		}
	}

	async getRepoInfo(request: { remote: string }): Promise<ProviderGetRepoInfoResponse> {
		try {
			const { owner, name } = this.getOwnerFromRemote(request.remote);
			const repoResponse = await this.get<BitbucketServerRepo>(`/projects/${owner}/repos/${name}`);
			const defaultBranchResponse = await this.get<BitbucketServerBranch>(
				`/projects/${owner}/repos/${name}/branches/default`
			);

			const defaultBranchName = defaultBranchResponse
				? defaultBranchResponse.body.displayId
				: undefined;

			const pullRequestResponse = await this.get<any>(
				`/projects/${owner}/repos/${name}/pull-requests?state=OPEN`
			);
			let pullRequests: ProviderPullRequestInfo[] = [];
			if (pullRequestResponse && pullRequestResponse.body && pullRequestResponse.body.values) {
				pullRequests = pullRequestResponse.body.values.map((_: any) => {
					return {
						id: _.id,
						url: _.links!.self[0]!.href,
						baseRefName: _.toRef.displayId,
						headRefName: _.fromRef.displayId
					};
				});
			}
			return {
				owner,
				name,
				id: repoResponse.body.id,
				key: repoResponse.body.project.key,
				defaultBranch: defaultBranchName,
				pullRequests: pullRequests
			};
		} catch (ex) {
			Logger.error(ex, `${this.displayName}: getRepoInfo`, {
				remote: request.remote
			});
			return {
				error: {
					type: "PROVIDER",
					message: `${this.displayName}: ${ex.message}`
				}
			};
		}
	}

	async getForkedRepos(request: { remote: string }): Promise<ProviderGetForkedReposResponse> {
		// TODO fix me
		return {
			parent: {},
			forks: []
		};
	}

	private _commentsByRepoAndPath = new Map<
		string,
		{ expiresAt: number; comments: Promise<PullRequestComment[]> }
	>();

	getIsMatchingRemotePredicate() {
		const baseUrl = this._providerInfo?.data?.baseUrl || this.getConfig().host;
		const configDomain = baseUrl ? URI.parse(baseUrl).authority : "";
		return (r: GitRemoteLike) => configDomain !== "" && r.domain === configDomain;
	}

	@log()
	protected async getCommentsForPath(
		filePath: string,
		repo: GitRepository
	): Promise<PullRequestComment[] | undefined> {
		const cc = Logger.getCorrelationContext();

		try {
			const relativePath = Strings.normalizePath(paths.relative(repo.path, filePath));
			const cacheKey = `${repo.path}|${relativePath}`;

			const cachedComments = this._commentsByRepoAndPath.get(cacheKey);
			if (cachedComments !== undefined && cachedComments.expiresAt > new Date().getTime()) {
				// NOTE: Keep this await here, so any errors are caught here
				return await cachedComments.comments;
			}
			super.invalidatePullRequestDocumentMarkersCache();

			const remotePath = await getRemotePaths(
				repo,
				this.getIsMatchingRemotePredicate(),
				this._knownRepos
			);

			const commentsPromise: Promise<PullRequestComment[]> =
				remotePath != null
					? this._getCommentsForPathCore(filePath, relativePath, remotePath)
					: Promise.resolve([]);
			this._commentsByRepoAndPath.set(cacheKey, {
				expiresAt: new Date().setMinutes(new Date().getMinutes() + REFRESH_TIMEOUT),
				comments: commentsPromise
			});

			// Since we aren't cached, we want to just kick of the request to get the comments (which will fire a notification)
			// This could probably be enhanced to wait for the commentsPromise for a short period of time (maybe 1s?) to see if it will complete, to avoid the notification roundtrip for fast requests
			return undefined;
		} catch (ex) {
			Logger.error(ex, cc);
			return undefined;
		}
	}

	private async _getCommentsForPathCore(
		filePath: string,
		relativePath: string,
		remotePaths: string[]
	) {
		const comments = [];

		for (const remotePath of remotePaths) {
			const pullRequestsResponse = await this.get<GetPullRequestsResponse>(
				`/repositories/${remotePath}/pullrequests?${qs.stringify({ q: "comment_count>0" })}`
			);

			const prComments = (
				await Promise.all(
					pullRequestsResponse.body.values.map(pr => this._getPullRequestComments(pr, relativePath))
				)
			).reduce((group, current) => group.concat(current), []);

			comments.push(...prComments);
		}

		// If we have any comments, fire a notification
		if (comments.length !== 0) {
			void SessionContainer.instance().documentMarkers.fireDidChangeDocumentMarkers(
				URI.file(filePath).toString(),
				"codemarks"
			);
		}

		return comments;
	}

	private async _getPullRequestComments(
		pr: BitbucketPullRequest,
		filePath: string
	): Promise<PullRequestComment[]> {
		return [];
	}
}

interface BitbucketServerCreatePullRequestRequest {
	fromRef: {
		id: string;
		repository: {
			project: {
				key: string;
			};
			slug: string;
		};
	};
	toRef: {
		id: string;
		repository: {
			project: {
				key: string;
			};
			slug: string;
		};
	};
	title: string;
	description?: string;
}

interface BitbucketServerCreatePullRequestResponse {
	id: string;
	links: { self: { href: string }[] };
	number: number;
	title: string;
}

interface BitbucketServerBranch {
	displayId: string;
	type: string;
	isDefault: boolean;
}

interface BitbucketServerRepo {
	id: string;
	project: {
		key: string;
	};
	mainbranch?: {
		name?: string;
		type?: string;
	};
}
