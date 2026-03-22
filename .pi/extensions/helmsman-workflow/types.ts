export type WorkflowMode = "plan" | "build";
export type WorkflowApprovalState = "draft" | "approved";

export interface WorkflowPlanState {
	goal: string;
	currentPhase: number | null;
	currentStep: number | null;
	targetFiles: string[];
	approvalState: WorkflowApprovalState;
}

export interface WorkflowState {
	mode: WorkflowMode;
	plan: WorkflowPlanState;
}

export interface WorkflowStateEntryData {
	mode?: WorkflowMode;
	plan?: Partial<WorkflowPlanState>;
}

export interface CustomStateEntryLike {
	type: string;
	customType?: string;
	data?: WorkflowStateEntryData;
}
