export type WorkflowMode = "plan" | "build" | "off";
export type WorkflowApprovalState = "draft" | "approved";

export interface WorkflowPlanPhase {
	name: string;
	steps: string[];
}

export interface WorkflowPlanState {
	goal: string;
	currentPhase: number | null;
	currentStep: number | null;
	targetFiles: string[];
	approvalState: WorkflowApprovalState;
	constraints: string[];
	assumptions: string[];
	verificationNotes: string[];
	explorationCommands: string[];
	phases: WorkflowPlanPhase[];
}

export interface WorkflowState {
	mode: WorkflowMode;
	plan: WorkflowPlanState;
	generatedPlanText?: string;
	adoptedPlan?: WorkflowPlanState;
	adoptedPlanText?: string;
}

export type WorkflowReviewDecision = "continue" | "handoff";
export type WorkflowReviewLevel = "low" | "medium" | "high";
export type WorkflowValidationState = "sufficient" | "insufficient";

export interface WorkflowSelfReview {
	trigger: string;
	confidence: WorkflowReviewLevel;
	risk: WorkflowReviewLevel;
	validation: WorkflowValidationState;
	decision: WorkflowReviewDecision;
	reasoning: string;
	followUp: string[];
}

export interface WorkflowPlanPresence {
	goal: boolean;
	currentPhase: boolean;
	currentStep: boolean;
	targetFiles: boolean;
	approvalState: boolean;
	constraints: boolean;
	assumptions: boolean;
	verificationNotes: boolean;
	phases: boolean;
}

export interface ParsedWorkflowPlanResult {
	plan: WorkflowPlanState;
	present: WorkflowPlanPresence;
}

export interface WorkflowStateEntryData {
	mode?: WorkflowMode;
	plan?: Partial<WorkflowPlanState>;
	generatedPlanText?: string;
	adoptedPlan?: Partial<WorkflowPlanState>;
	adoptedPlanText?: string;
}

export interface CustomStateEntryLike {
	type: string;
	customType?: string;
	data?: WorkflowStateEntryData;
}
