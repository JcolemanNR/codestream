import React, { useEffect, useState } from "react";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { NoContent } from "../src/components/Pane";

import { Button } from "../src/components/Button";

import { HostApi } from "../webview-api";

import { useDidMount } from "../utilities/hooks";
import { GetObservabilityEntitiesRequestType } from "@codestream/protocols/agent";

import { keyBy as _keyBy } from "lodash-es";
import { api } from "../store/codeErrors/actions";
import { DropdownButton } from "./DropdownButton";

interface EntityAssociatorProps {
	title?: string;
	label?: string;
	remote: string;
	remoteName: string;
	onSuccess: Function;
}

export const EntityAssociator = React.memo((props: EntityAssociatorProps) => {
	const dispatch = useDispatch<any>();

	const [entities, setEntities] = useState<{ guid: string; name: string }[]>([]);
	const [selected, setSelected] = useState<{ guid: string; name: string } | undefined>(undefined);
	const [isLoading, setIsLoading] = useState(false);

	useDidMount(() => {
		HostApi.instance
			.send(GetObservabilityEntitiesRequestType, { appName: props.remoteName })
			.then(_ => {
				setEntities(_.entities);
			});
	});

	const items = entities?.length
		? ([
				{
					type: "search",
					placeholder: "Search...",
					action: "search",
					key: "search"
				}
		  ] as any).concat(
				entities.map(_ => {
					return {
						key: _.guid,
						label: _.name,
						searchLabel: _.name,
						action: () => {
							setSelected(_);
						}
					};
				})
		  )
		: [];

	return (
		<NoContent style={{ marginLeft: "40px" }}>
			{props.title && <h3>{props.title}</h3>}
			<p style={{ marginTop: 0 }}>{props.label}</p>
			<DropdownButton
				items={items}
				selectedKey={selected ? selected.guid : undefined}
				variant={"secondary"}
				//size="compact"
				wrap
			>
				{selected ? selected.name : "Select entity"}
			</DropdownButton>{" "}
			<Button
				isLoading={isLoading}
				disabled={isLoading || !selected}
				onClick={e => {
					e.preventDefault();
					setIsLoading(true);

					const payload = {
						url: props.remote,
						name: props.remoteName,
						applicationEntityGuid: selected?.guid,
						entityId: selected?.guid,
						parseableAccountId: selected?.guid
					};
					dispatch(api("assignRepository", payload)).then(_ => {
						setTimeout(() => {
							if (_?.directives) {
								console.log("assignRepository", {
									directives: _?.directives
								});
								// a little fragile, but we're trying to get the entity guid back
								props.onSuccess &&
									props.onSuccess({
										entityGuid: _?.directives.find(d => d.type === "assignRepository")?.data
											?.entityGuid
									});
							} else {
								console.log("Could not find directive", {
									payload: payload
								});
							}
							setIsLoading(false);
						}, 2500);
					});
				}}
			>
				Associate
			</Button>
		</NoContent>
	);
});
