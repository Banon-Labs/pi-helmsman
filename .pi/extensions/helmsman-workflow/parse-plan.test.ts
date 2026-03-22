import { describe, expect, test } from "bun:test";
import { parseWorkflowPlanFromText } from "./parse-plan";

describe("parseWorkflowPlanFromText", () => {
	test("parses structured planner output into workflow fields", () => {
		const parsed = parseWorkflowPlanFromText(`Goal: Add planner support\nConstraints:\n- stay read-only first\nAssumptions:\n- user wants a draft\nTarget Files:\n- .pi/extensions/helmsman-workflow.ts\nCurrent Phase: 2\nCurrent Step: 3\nVerification Notes:\n- run bun test\nApproval State: draft\nPlan:\nPhase 1: Clarify and inspect\n1. Review the current extension\n2. Confirm target files\n3. Draft structure\nPhase 2: Implement and verify\n1. Update planner state\n2. Run tests\n3. Summarize remaining risks`);

		expect(parsed).not.toBeNull();
		expect(parsed?.plan.goal).toBe("Add planner support");
		expect(parsed?.plan.constraints).toEqual(["stay read-only first"]);
		expect(parsed?.plan.assumptions).toEqual(["user wants a draft"]);
		expect(parsed?.plan.targetFiles).toEqual([".pi/extensions/helmsman-workflow.ts"]);
		expect(parsed?.plan.currentPhase).toBe(2);
		expect(parsed?.plan.currentStep).toBe(3);
		expect(parsed?.plan.verificationNotes).toEqual(["run bun test"]);
		expect(parsed?.plan.approvalState).toBe("draft");
		expect(parsed?.plan.phases).toHaveLength(2);
		expect(parsed?.present.targetFiles).toBeTrue();
		expect(parsed?.present.constraints).toBeTrue();
		expect(parsed?.plan.phases[0].steps).toEqual([
			"Review the current extension",
			"Confirm target files",
			"Draft structure",
		]);
	});

	test("returns null when no recognizable planner sections exist", () => {
		expect(parseWorkflowPlanFromText("Just a casual reply without plan structure")).toBeNull();
	});

	test("tracks which planner sections were actually present", () => {
		const parsed = parseWorkflowPlanFromText(`Goal: refine parser behavior\nPlan:\nPhase 1: Clarify\n1. Inspect parser\n2. Add tests\n3. Merge safely`);

		expect(parsed).not.toBeNull();
		expect(parsed?.present.goal).toBeTrue();
		expect(parsed?.present.phases).toBeTrue();
		expect(parsed?.present.constraints).toBeFalse();
		expect(parsed?.present.targetFiles).toBeFalse();
		expect(parsed?.present.verificationNotes).toBeFalse();
	});

	test("parses heading-style live model output without colons", () => {
		const parsed = parseWorkflowPlanFromText(`Goal
Ensure the helmsman plan lifecycle enforces execution safety by automatically marking freshly edited or clarified plans as draft before any build/run command can act on them, preventing stale approvals from triggering unintended execution.

Constraints
- Keep the slice scoped to .pi/extensions/helmsman-workflow.ts (with only minimal touching of helper state APIs if absolutely necessary).
- Follow the existing plan-mode guardrails (clarification at start, tool limits).
- Maintain tooling sets and UI notifications already in place.

Assumptions
- “Execution safety” here means preventing build/run while the plan has been edited but still marked approved.
- The surrounding helper modules (state updates, approval flags) already support this behavior; we only need to coordinate them from the extension.
- No new UI flows or commands are required beyond what the extension already exposes.

Target Files
- .pi/extensions/helmsman-workflow.ts (primarily, plus potential touched imports from state.ts if needed for new helper invocation).

Current Phase
Phase 1 (Exploration & Scoping): Understand how input/goal resolution currently updates workflowState.plan and approval state so we know where to insert the safety guard.

Plan

Phase 1: Inspect current plan-update hooks
1. Trace the path from pi.on("input") through resolvePlanGoal and updateWorkflowPlanScaffold to see how the plan goal/scaffold is refreshed.
2. Confirm whether updateWorkflowPlanScaffold or related helpers already touch approval state; identify where to intercept if not.
3. Verify how persisted state and UI status updates occur after plan changes, so we keep notifications in sync.

Phase 2: Implement the safety guard
1. Import updateWorkflowApprovalState into .pi/extensions/helmsman-workflow.ts if not already.
2. In the branch where workflowState is updated after resolvePlanGoal, wrap the update to also force approval state to "draft" whenever user input produces a new goal.
3. Persist the revised state and update footer/status as usual so the UI reflects the forced draft state.

Verification Notes
- Manual check: send plan-mode input and verify /status shows approval “draft” even if it was previously approved.
- Optional: observe notification flow (footer status updates and plan-mode reminders) to ensure nothing breaks.

Approval State
Draft`);

		expect(parsed).not.toBeNull();
		expect(parsed?.plan.goal).toContain("Ensure the helmsman plan lifecycle enforces execution safety");
		expect(parsed?.plan.currentPhase).toBe(1);
		expect(parsed?.plan.currentStep).toBe(1);
		expect(parsed?.plan.approvalState).toBe("draft");
		expect(parsed?.plan.targetFiles[0]).toContain(".pi/extensions/helmsman-workflow.ts");
		expect(parsed?.plan.phases).toHaveLength(2);
		expect(parsed?.present.goal).toBeTrue();
		expect(parsed?.present.approvalState).toBeTrue();
	});

	test("parses markdown-styled live model output with bold headings and numbered bold phases", () => {
		const parsed = parseWorkflowPlanFromText(`**Goal**  
Add a focused execution-safety improvement to \.pi/extensions/helmsman-workflow.ts so plan-mode prompts explicitly reinforce the read-only, clarification-first guidance and prevent build-mode tool activation until the planner has recorded an explicit clarifying question/answer pair.

**Constraints**  
- Keep changes limited to the helmsman workflow extension and supporting helpers (no new files unless justified).  
- Adhere to “plan before build” flow and avoid introducing runtime regressions for existing commands.

**Assumptions**  
- The planner should always confirm or capture clarification in plan mode before switching to build tools.

**Target Files**  
- \.pi/extensions/helmsman-workflow.ts (primary)
- Any new helper modules under \.pi/extensions/helmsman-workflow/ if supporting logic is needed.

**Current Phase**  
Planning (collecting requirements and outlining the small execution-safety slice).

**Plan**  
1. **Phase 1 – Audit current prompt behavior (3 steps)**  
   1. Review before_agent_start injection logic.  
   2. Identify where plan mode state tracks clarification.  
   3. Note whether any existing UI hook enforces question asking.

2. **Phase 2 – Specify enforcement strategy (3 steps)**  
   1. Decide how to represent clarification captured.  
   2. Define triggers for intercepting /mode build, /run, or /step.  
   3. Outline reminder text.

**Verification Notes**  
- Running plan mode should show the updated reminder.
- Attempts to switch to build mode or run commands before clarification should be blocked with a warning.

**Approval State**  
Draft`);

		expect(parsed).not.toBeNull();
		expect(parsed?.plan.goal).toContain("Add a focused execution-safety improvement");
		expect(parsed?.plan.approvalState).toBe("draft");
		expect(parsed?.plan.currentPhase).toBe(1);
		expect(parsed?.plan.currentStep).toBe(1);
		expect(parsed?.plan.phases).toHaveLength(2);
		expect(parsed?.plan.phases[0]?.name).toContain("Audit current prompt behavior");
		expect(parsed?.plan.targetFiles[0]).toContain("helmsman-workflow.ts");
	});
});
