import { plural } from '@/lib/tas'
import { Modal, TypeToConfirm } from '../ui'
import { deletePlan } from './actions'

export default function DeletePlanModal({ plan, back = '/production' }) {
  const issues = plan.issues || []
  const dprs = plan.dprs || []
  const hasActivity = issues.length > 0 || dprs.length > 0

  return (
    <Modal
      title={`Delete ${plan.plan_no}?`}
      icon="ph-trash"
      ariaLabel={`Delete ${plan.plan_no}`}
      btnIcon="ph-trash"
      btnClass="btn order-act-btn delete"
      size="small"
    >
      <form action={deletePlan}>
        <input type="hidden" name="id" value={plan.id} />
        <input type="hidden" name="back" value={back} />
        <TypeToConfirm word={hasActivity ? plan.plan_no : null} label="Delete Plan" icon="ph-trash">
          <p>
            Permanently delete production plan <b>{plan.plan_no}</b>? This cannot be undone.
          </p>
          {hasActivity && (
            <div className="banner warn">
              <i className="ph ph-warning" />
              <span>
                This plan is linked to{' '}
                {[
                  issues.length > 0 && plural(issues.length, 'RM issue'),
                  dprs.length > 0 && plural(dprs.length, 'production entry', 'production entries'),
                ].filter(Boolean).join(' and ')}
                . Deleting the plan removes the schedule only — those issues, stock moves, and DPRs are kept intact.
              </span>
            </div>
          )}
        </TypeToConfirm>
      </form>
    </Modal>
  )
}
