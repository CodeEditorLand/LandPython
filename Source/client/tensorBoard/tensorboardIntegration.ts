/* eslint-disable comma-dangle */

/* eslint-disable implicit-arrow-linebreak */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from "inversify";
import { commands, Extension, Uri } from "vscode";

import { IWorkspaceService } from "../common/application/types";
import { TENSORBOARD_EXTENSION_ID } from "../common/constants";
import { IDisposableRegistry, IExtensions, Resource } from "../common/types";
import { IEnvironmentActivationService } from "../interpreter/activation/types";
import { TensorboardDependencyChecker } from "./tensorboardDependencyChecker";
import { TensorBoardPrompt } from "./tensorBoardPrompt";

type PythonApiForTensorboardExtension = {
	/**
	 * Gets activated env vars for the active Python Environment for the given resource.
	 */
	getActivatedEnvironmentVariables(
		resource: Resource,
	): Promise<NodeJS.ProcessEnv | undefined>;
	/**
	 * Ensures that the dependencies required for TensorBoard are installed in Active Environment for the given resource.
	 */
	ensureDependenciesAreInstalled(resource?: Uri): Promise<boolean>;
	/**
	 * Whether to allow displaying tensorboard prompt.
	 */
	isPromptEnabled(): boolean;
};

type TensorboardExtensionApi = {
	/**
	 * Registers python extension specific parts with the tensorboard extension
	 */
	registerPythonApi(
		interpreterService: PythonApiForTensorboardExtension,
	): void;
};

@injectable()
export class TensorboardExtensionIntegration {
	private tensorboardExtension:
		| Extension<TensorboardExtensionApi>
		| undefined;

	constructor(
		@inject(IExtensions) private readonly extensions: IExtensions,
		@inject(IEnvironmentActivationService)
		private readonly envActivation: IEnvironmentActivationService,
		@inject(IWorkspaceService) private workspaceService: IWorkspaceService,
		@inject(TensorboardDependencyChecker)
		private readonly dependencyChcker: TensorboardDependencyChecker,
		@inject(TensorBoardPrompt)
		private readonly tensorBoardPrompt: TensorBoardPrompt,
		@inject(IDisposableRegistry) disposables: IDisposableRegistry,
	) {
		this.hideCommands();
		extensions.onDidChange(this.hideCommands, this, disposables);
	}

	public registerApi(
		tensorboardExtensionApi: TensorboardExtensionApi,
	): TensorboardExtensionApi | undefined {
		this.hideCommands();
		if (!this.workspaceService.isTrusted) {
			this.workspaceService.onDidGrantWorkspaceTrust(() =>
				this.registerApi(tensorboardExtensionApi),
			);
			return undefined;
		}
		tensorboardExtensionApi.registerPythonApi({
			getActivatedEnvironmentVariables: async (resource: Resource) =>
				this.envActivation.getActivatedEnvironmentVariables(
					resource,
					undefined,
					true,
				),
			ensureDependenciesAreInstalled: async (
				resource?: Uri,
			): Promise<boolean> =>
				this.dependencyChcker.ensureDependenciesAreInstalled(resource),
			isPromptEnabled: () => this.tensorBoardPrompt.isPromptEnabled(),
		});
		return undefined;
	}

	public hideCommands(): void {
		if (this.extensions.getExtension(TENSORBOARD_EXTENSION_ID)) {
			void commands.executeCommand(
				"setContext",
				"python.tensorboardExtInstalled",
				true,
			);
		}
	}

	public async integrateWithTensorboardExtension(): Promise<void> {
		const api = await this.getExtensionApi();
		if (api) {
			this.registerApi(api);
		}
	}

	private async getExtensionApi(): Promise<
		TensorboardExtensionApi | undefined
	> {
		if (!this.tensorboardExtension) {
			const extension =
				this.extensions.getExtension<TensorboardExtensionApi>(
					TENSORBOARD_EXTENSION_ID,
				);
			if (!extension) {
				return undefined;
			}
			await extension.activate();
			if (extension.isActive) {
				this.tensorboardExtension = extension;
				return this.tensorboardExtension.exports;
			}
		} else {
			return this.tensorboardExtension.exports;
		}
		return undefined;
	}
}
