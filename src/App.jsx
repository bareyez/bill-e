import { useState, useRef } from 'react'

const PHASES = {
  CERTIFICATION: 'certification',
  INSURANCE: 'insurance',
  FPL: 'fpl',
  DRUG_TYPE: 'drug_type',
  DRUG_DETAILS: 'drug_details',
  RESULT: 'result'
}

const DRUG_TYPES = {
  ARV_BRAND: 'ARV/Brand',
  RW_FORMULARY: 'RW Formulary',
  NON_RW_FORMULARY: 'Non-RW-Formulary',
}

function App() {
  const [phase, setPhase] = useState(PHASES.CERTIFICATION)
  const [answers, setAnswers] = useState({
    certified: null,
    hasInsurance: null,
    insuranceType: null,
    fpl: null,
    path: null, // LPAP or MEDCO
    drugType: null,
    isARVOnly: null,
    // Legacy field (kept for backward compatibility in state; no longer used in UI flow)
    drugCovered: null,
    // New distinctions
    // Non-Formulary drug: may still be covered by primary (RW non-formulary but covered by primary)
    nonFormularyPrimaryCovered: null, // boolean|null
    // RW Formulary drug: primary status can be covered, denied, or “primary non-formulary but RW formulary” (COB override)
    rwPrimaryStatus: null, // 'covered' | 'denied' | 'nonformulary' | null
    mmcapPrice: null,
  })
  const fplInputRef = useRef(null)
  const mmcapInputRef = useRef(null)

  const formatYesNo = (val) => {
    if (val === true) return 'Yes'
    if (val === false) return 'No'
    return '—'
  }

  const getTrafficState = () => {
    // Returns: { state: 'green'|'yellow'|'red'|'neutral', reasons: string[], flags: {...} }
    const reasons = []

    const flags = {
      medicareNoMfg: answers.insuranceType === 'Medicare',
      medcoShadow: answers.path === 'MEDCO',
    }

    // Hard stops
    if (answers.certified === false) {
      reasons.push('Not Ryan White certified')
      return { state: 'red', reasons, flags }
    }

    if (answers.insuranceType === 'Medicare' && typeof answers.fpl === 'number' && answers.fpl > 400) {
      reasons.push('Medicare + FPL > 400% (ineligible)')
      return { state: 'red', reasons, flags }
    }

    if (answers.drugType === DRUG_TYPES.NON_RW_FORMULARY && typeof answers.mmcapPrice === 'number' && answers.mmcapPrice >= 50) {
      reasons.push('Non-Formulary with MMCAP ≥ $50 (supervisor approval)')
      return { state: 'red', reasons, flags }
    }
    if (
      answers.drugType === 'RW Formulary' &&
      answers.rwPrimaryStatus === 'nonformulary' &&
      typeof answers.mmcapPrice === 'number' &&
      answers.mmcapPrice >= 50
    ) {
      reasons.push('RW Formulary + Primary non-formulary with MMCAP ≥ $50 (supervisor approval)')
      return { state: 'red', reasons, flags }
    }

    // Special action required (yellow)
    if (answers.path === 'MEDCO') reasons.push('Shadow claim reporting required (PI2MEDCO)')
    if (answers.drugType === 'RW Formulary' && answers.rwPrimaryStatus === 'denied') reasons.push('Primary denied: flip to LPAP full cost')
    if (answers.drugType === 'RW Formulary' && answers.rwPrimaryStatus === 'nonformulary') reasons.push('Primary non-formulary: use COB override with LPAP')
    if (answers.drugType === DRUG_TYPES.NON_RW_FORMULARY && typeof answers.mmcapPrice === 'number' && answers.mmcapPrice < 50) {
      reasons.push('Non-Formulary: use LPAP')
    }

    if (reasons.length > 0) return { state: 'yellow', reasons, flags }

    // If we have enough info for a normal flow, call it green. Otherwise neutral.
    const hasProgress =
      answers.certified !== null ||
      answers.hasInsurance !== null ||
      answers.insuranceType !== null ||
      answers.fpl !== null ||
      answers.drugType !== null

    return { state: hasProgress ? 'green' : 'neutral', reasons: [], flags }
  }

  const getSelections = () => {
    const selections = []

    selections.push({
      label: 'Ryan White Certified (up to date)',
      value: formatYesNo(answers.certified),
    })

    // If not certified, we stop early (but still show what was answered).
    if (answers.certified === false) return selections

    selections.push({
      label: 'Has insurance',
      value: formatYesNo(answers.hasInsurance),
    })

    // If no insurance, we stop early.
    if (answers.hasInsurance === false) return selections

    selections.push({
      label: 'Primary insurance type',
      value: answers.insuranceType ?? '—',
    })

    if (answers.insuranceType) {
      selections.push({
        label: 'FPL %',
        value: typeof answers.fpl === 'number' ? `${answers.fpl}%` : '—',
      })
    }

    // If Medicare and ineligible, we stop early.
    if (answers.insuranceType === 'Medicare' && typeof answers.fpl === 'number' && answers.fpl > 400) {
      return selections
    }

    // Only show “Program path” if it’s meaningful (Commercial sets LPAP/MEDCO; Medicare sets DOH copay card).
    if (answers.path) {
      selections.push({
        label: 'Program path (derived)',
        value: answers.path,
      })
    }

    selections.push({
      label: 'Drug type',
      value: answers.drugType ?? '—',
    })

    if (answers.drugType === DRUG_TYPES.ARV_BRAND && answers.insuranceType === 'Commercial') {
      selections.push({
        label: 'ARV only',
        value: formatYesNo(answers.isARVOnly),
      })
    }

    if (answers.drugType === DRUG_TYPES.RW_FORMULARY) {
      const map = {
        covered: 'Covered',
        denied: 'Denied',
        nonformulary: 'Non-Formulary (Primary) — COB override',
      }
      selections.push({
        label: 'Primary status (RW formulary)',
        value: answers.rwPrimaryStatus ? map[answers.rwPrimaryStatus] : '—',
      })
      // If “primary non-formulary but RW formulary”, MMCAP gate applies
      if (answers.rwPrimaryStatus === 'nonformulary') {
        selections.push({
          label: 'MMCAP price',
          value: typeof answers.mmcapPrice === 'number' ? `$${answers.mmcapPrice}` : '—',
        })
      }
    }

    if (answers.drugType === DRUG_TYPES.NON_RW_FORMULARY) {
      selections.push({
        label: 'Covered by Primary (Non-Formulary)',
        value: formatYesNo(answers.nonFormularyPrimaryCovered),
      })
      selections.push({
        label: 'MMCAP price',
        value: typeof answers.mmcapPrice === 'number' ? `$${answers.mmcapPrice}` : '—',
      })
    }

    return selections
  }

  // Extract build function for use in both SummaryRail and BillingSequencePanel
  const buildBillingSequence = () => {
    // Nothing answered yet
    if (answers.certified === null) {
      return { title: 'Billing sequence', steps: [], note: null }
    }

    // Phase 1 stop
    if (answers.certified === false) {
      return {
        title: 'Billing sequence',
        steps: [{ label: 'STOP: Refer to Case Manager for Part A/B enrollment.', type: 'stop' }],
        note: null,
      }
    }

    // No insurance path
    if (answers.hasInsurance === false) {
      return {
        title: 'Billing sequence',
        steps: [{ label: 'DIRECT DISPENSE: Bill through MAGELLAN', type: 'primary' }],
        note: null,
      }
    }

    // Need insurance answer first
    if (answers.hasInsurance === null) {
      return { title: 'Billing sequence', steps: [], note: null }
    }

    // Need insurance type
    if (!answers.insuranceType) {
      return { title: 'Billing sequence', steps: [], note: null }
    }

    // Need FPL
    if (typeof answers.fpl !== 'number') {
      return { title: 'Billing sequence', steps: [], note: null }
    }

    // Medicare ineligible
    if (answers.insuranceType === 'Medicare' && answers.fpl > 400) {
      return {
        title: 'Billing sequence',
        steps: [{ label: 'STOP: Ineligible for Pharmacy', type: 'stop' }],
        note: null,
      }
    }

    // Need drug type
    if (!answers.drugType) {
      return { title: 'Billing sequence', steps: [], note: null }
    }

    // Drug-specific flows
    if (answers.drugType === DRUG_TYPES.ARV_BRAND) {
      if (answers.insuranceType === 'Medicare') {
        return {
          title: 'Billing sequence',
          steps: [
            { label: 'Primary Insurance' },
            { label: 'DOH Copay Card' },
          ],
          note: 'NEVER use Manufacturer Copay Cards for Medicare.',
        }
      }

      // Commercial
      if (answers.isARVOnly === null) {
        return { title: 'Billing sequence', steps: [], note: null }
      }

      if (answers.isARVOnly === true) {
        return {
          title: 'Billing sequence',
          steps: [
            { label: 'Primary Insurance' },
            { label: 'Manufacturer Copay Card' },
          ],
          note: 'Only ARV prescribed: no MEDCO step.',
        }
      }

      return {
        title: 'Billing sequence',
        steps: [
          { label: 'Primary Insurance' },
          { label: 'Manufacturer Copay Card' },
          { label: answers.path || 'MEDCO/LPAP (residual)' },
        ],
        note:
          answers.path === 'MEDCO'
            ? 'SHADOW CLAIM REQUIRED: Run PI2MEDCO on all prescriptions for reporting.'
            : null,
      }
    }

    if (answers.drugType === DRUG_TYPES.RW_FORMULARY) {
      if (answers.rwPrimaryStatus === null) {
        return { title: 'Billing sequence', steps: [], note: null }
      }

      if (answers.rwPrimaryStatus === 'denied') {
        return {
          title: 'Billing sequence',
          steps: [{ label: 'LPAP (process full cost)' }],
          note: null,
        }
      }

      if (answers.rwPrimaryStatus === 'nonformulary') {
        if (typeof answers.mmcapPrice !== 'number') return { title: 'Billing sequence', steps: [], note: null }
        if (answers.mmcapPrice >= 50) {
          return {
            title: 'Billing sequence',
            steps: [{ label: 'STOP: Seek Supervisor Approval' }],
            note: null,
          }
        }
        return {
          title: 'Billing sequence',
          steps: [{ label: 'Primary Insurance' }, { label: 'LPAP (COB override)' }],
          note: null,
        }
      }

      // Covered (standard)
      return {
        title: 'Billing sequence',
        steps: [
          { label: 'Primary Insurance' },
          { label: answers.path || 'MEDCO/LPAP' },
        ],
        note:
          answers.path === 'MEDCO'
            ? 'SHADOW CLAIM REQUIRED: Run PI2MEDCO on all prescriptions for reporting.'
            : null,
      }
    }

    if (answers.drugType === DRUG_TYPES.NON_RW_FORMULARY) {
      if (answers.nonFormularyPrimaryCovered === null) {
        return { title: 'Billing sequence', steps: [], note: null }
      }
      if (typeof answers.mmcapPrice !== 'number') {
        return { title: 'Billing sequence', steps: [], note: null }
      }

      if (answers.mmcapPrice < 50) {
        return {
          title: 'Billing sequence',
          steps:
            answers.nonFormularyPrimaryCovered === true
              ? [{ label: 'Primary Insurance' }, { label: 'LPAP' }]
              : [{ label: 'Primary Insurance' }, { label: 'LPAP (COB override)' }],
          note: null,
        }
      }

      return {
        title: 'Billing sequence',
        steps: [{ label: 'STOP: Seek Supervisor Approval' }],
        note: null,
      }
    }

    return { title: 'Billing sequence', steps: [], note: null }
  }

  const SummaryRail = () => {
    const selections = getSelections()
    const data = buildBillingSequence()

    // Check if MEDCO actually appears in the billing sequence steps
    const hasMedcoInSequence = data.steps.some(step => 
      step.label === 'MEDCO' || 
      step.label.includes('MEDCO') ||
      (answers.path === 'MEDCO' && step.label === answers.path)
    )

    const badgeFor = (label) => {
      if (label === 'Primary Insurance') return { text: 'PRIMARY', cls: 'bg-blue-600 text-white' }
      if (label === 'Manufacturer Copay Card') return { text: 'MFG CARD', cls: 'bg-amber-500 text-white' }
      if (label === 'DOH Copay Card') return { text: 'DOH COPAY', cls: 'bg-green-600 text-white' }
      if (label === 'MEDCO' || label.includes('MEDCO')) return { text: 'MEDCO', cls: 'bg-purple-600 text-white' }
      if (label === 'LPAP' || label.startsWith('LPAP')) return { text: 'LPAP', cls: 'bg-green-600 text-white' }
      if (label.includes('MAGELLAN')) return { text: 'MAGELLAN', cls: 'bg-blue-700 text-white' }
      if (label.startsWith('STOP:')) return { text: 'STOP', cls: 'bg-red-700 text-white' }
      return null
    }

    return (
      <section className="flex flex-col h-full rounded-2xl shadow-xl border border-gray-200 bg-white/95 backdrop-blur">
        <div className="rounded-t-2xl border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4">
          <h3 className="text-base font-bold text-gray-900">Current Patient</h3>
          <p className="text-xs text-gray-600 mt-1">Selections & billing sequence</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Selections */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Selections</h4>
            <div className="space-y-2">
              {selections.length === 0 ? (
                <div className="text-xs text-gray-400 italic">No selections yet</div>
              ) : (
                selections.map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="text-[10px] font-medium text-gray-600 uppercase tracking-wide flex-1">{item.label}</div>
                    <div className="text-xs font-semibold text-gray-900 text-right">{item.value}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Billing Sequence */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Billing Sequence</h4>
            {hasMedcoInSequence && (
              <div className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-purple-300 bg-purple-50 px-3 py-2">
                <span className="text-xs font-bold text-purple-900">PI2MEDCO</span>
                <span className="animate-pulse rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                  REQUIRED
                </span>
              </div>
            )}
            {data.steps.length === 0 ? (
              <div className="text-xs text-gray-400 italic">Complete selections to see sequence</div>
            ) : (
              <ol className="space-y-2">
                {data.steps.map((step, idx) => {
                  const badge = badgeFor(step.label)
                  const isStop = step.label.startsWith('STOP:')
                  return (
                    <li
                      key={`${step.label}-${idx}`}
                      className={`rounded-xl border px-3 py-2.5 ${
                        isStop ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white shadow-sm'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-[10px] font-bold text-gray-900">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {badge && (
                              <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide ${badge.cls}`}>
                                {badge.text}
                              </span>
                            )}
                            <span className="text-xs font-semibold text-gray-900 break-words">{step.label}</span>
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>

        {/* Start Over Button at Bottom */}
        <div className="rounded-b-2xl border-t border-gray-200 bg-gray-50 p-4">
          <button
            onClick={reset}
            className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg active:scale-[0.98]"
          >
            Start Over
          </button>
        </div>
      </section>
    )
  }

  const BillingSequencePanel = () => {
    const traffic = getTrafficState()

    const panelStyles = {
      green: { ring: 'ring-green-200', header: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-500' },
      yellow: { ring: 'ring-yellow-200', header: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-500' },
      red: { ring: 'ring-red-200', header: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' },
      neutral: { ring: 'ring-gray-200', header: 'bg-gray-50', border: 'border-gray-200', dot: 'bg-gray-400' },
    }
    const ps = panelStyles[traffic.state] || panelStyles.neutral

    const badgeFor = (label) => {
      if (label === 'Primary Insurance') return { text: 'PRIMARY', cls: 'bg-blue-600 text-white' }
      if (label === 'Manufacturer Copay Card') return { text: 'MFG CARD', cls: 'bg-amber-500 text-white' } // Gold
      if (label === 'DOH Copay Card') return { text: 'DOH COPAY', cls: 'bg-green-600 text-white' }
      if (label === 'MEDCO' || label.includes('MEDCO')) return { text: 'MEDCO', cls: 'bg-purple-600 text-white' } // Purple
      if (label === 'LPAP' || label.startsWith('LPAP')) return { text: 'LPAP', cls: 'bg-green-600 text-white' } // Green
      if (label.includes('MAGELLAN')) return { text: 'MAGELLAN', cls: 'bg-blue-700 text-white' }
      if (label.startsWith('STOP:')) return { text: 'STOP', cls: 'bg-red-700 text-white' }
      return null
    }

    const build = () => buildBillingSequence()

    const data = build()

    // Check if MEDCO actually appears in the billing sequence steps
    const hasMedcoInSequence = data.steps.some(step => 
      step.label === 'MEDCO' || 
      step.label.includes('MEDCO') ||
      (answers.path === 'MEDCO' && step.label === answers.path)
    )

    return (
      <section className={`rounded-2xl shadow-lg border bg-white/70 backdrop-blur ring-1 ${ps.ring} ${ps.border}`}>
        <div className={`rounded-t-2xl border-b ${ps.border} ${ps.header} px-6 py-4`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${ps.dot}`} />
              <h3 className="text-base font-semibold text-gray-900">Billing sequence</h3>
            </div>
            <span className="text-xs text-gray-600">Checklist • payer order</span>
          </div>
        </div>

        <div className="px-6 py-5">
          {/* Persistent rule callouts */}
          {traffic.flags.medicareNoMfg && (
            <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
              <div className="text-xs font-semibold text-yellow-900">MEDICARE RULE: No manufacturer copay cards allowed.</div>
            </div>
          )}
          {hasMedcoInSequence && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-purple-300 bg-purple-50 px-4 py-2">
              <span className="text-xs font-bold text-purple-900">PI2MEDCO</span>
              <span className="animate-pulse rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                REQUIRED
              </span>
            </div>
          )}

          {data.steps.length === 0 ? (
            <div className="text-sm text-gray-600">Make selections to see the recommended billing sequence.</div>
          ) : (
            <ol className="space-y-3">
              {data.steps.map((step, idx) => {
                const badge = badgeFor(step.label)
                const isStop = step.label.startsWith('STOP:')
                const box =
                  isStop
                    ? 'border-red-200 bg-red-50'
                    : traffic.state === 'yellow'
                      ? 'border-yellow-200 bg-yellow-50'
                      : 'border-gray-200 bg-white'
                return (
                  <li key={`${step.label}-${idx}`} className={`rounded-xl border ${box} px-4 py-3`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-bold text-gray-900">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {badge && <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-extrabold tracking-wide ${badge.cls}`}>{badge.text}</span>}
                          <span className="text-sm font-semibold text-gray-900">{step.label}</span>
                        </div>
                      </div>
                      <div className="mt-1 h-3 w-3 rounded-full bg-gray-300" aria-hidden="true" />
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          {data.note && (
            <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
              <div className="text-xs font-semibold text-yellow-900">{data.note}</div>
            </div>
          )}
        </div>
      </section>
    )
  }

  const reset = () => {
    setPhase(PHASES.CERTIFICATION)
    setAnswers({
      certified: null,
      hasInsurance: null,
      insuranceType: null,
      fpl: null,
      path: null,
      drugType: null,
      isARVOnly: null,
      drugCovered: null,
      nonFormularyPrimaryCovered: null,
      rwPrimaryStatus: null,
      mmcapPrice: null,
    })
  }

  const handleAnswer = (key, value) => {
    const newAnswers = { ...answers, [key]: value }
    setAnswers(newAnswers)

    // Phase transitions
    if (key === 'certified') {
      if (value === false) {
        setPhase(PHASES.RESULT)
      } else {
        setPhase(PHASES.INSURANCE)
      }
    } else if (key === 'hasInsurance') {
      if (value === false) {
        setPhase(PHASES.RESULT)
      } else {
        setPhase(PHASES.INSURANCE)
      }
    } else if (key === 'insuranceType') {
      setPhase(PHASES.FPL)
    } else if (key === 'fpl') {
      // Determine path based on insurance type and FPL
      if (newAnswers.insuranceType === 'Medicare') {
        if (value > 400) {
          setPhase(PHASES.RESULT)
        } else {
          newAnswers.path = 'DOH Copay Card'
          setPhase(PHASES.DRUG_TYPE)
        }
      } else if (newAnswers.insuranceType === 'Commercial') {
        if (value < 50) {
          newAnswers.path = 'LPAP'
        } else {
          newAnswers.path = 'MEDCO'
        }
        setPhase(PHASES.DRUG_TYPE)
      }
      setAnswers(newAnswers)
    } else if (key === 'drugType') {
      // Clear downstream answers when changing drug type to avoid stale state
      newAnswers.isARVOnly = null
      newAnswers.drugCovered = null
      newAnswers.nonFormularyPrimaryCovered = null
      newAnswers.rwPrimaryStatus = null
      newAnswers.mmcapPrice = null
      setAnswers(newAnswers)

      if (value === DRUG_TYPES.ARV_BRAND) {
        // Medicare with ARV/Brand goes straight to result (no Mfg cards for Medicare)
        if (newAnswers.insuranceType === 'Medicare') {
          setPhase(PHASES.RESULT)
        } else {
          setPhase(PHASES.DRUG_DETAILS)
        }
      } else if (value === DRUG_TYPES.RW_FORMULARY) {
        setPhase(PHASES.DRUG_DETAILS)
      } else if (value === DRUG_TYPES.NON_RW_FORMULARY) {
        setPhase(PHASES.DRUG_DETAILS)
      }
    } else if (key === 'isARVOnly') {
      if (value === true) {
        setPhase(PHASES.RESULT)
      } else {
        setPhase(PHASES.RESULT)
      }
    } else if (key === 'drugCovered') {
      setPhase(PHASES.RESULT)
    } else if (key === 'rwPrimaryStatus') {
      // If RW formulary but primary non-formulary, we need MMCAP price check
      if (value === 'nonformulary') {
        newAnswers.mmcapPrice = null
        setAnswers(newAnswers)
        setPhase(PHASES.DRUG_DETAILS)
      } else {
        setPhase(PHASES.RESULT)
      }
    } else if (key === 'nonFormularyPrimaryCovered') {
      // Always follow with MMCAP price check ($50 rule remains)
      newAnswers.mmcapPrice = null
      setAnswers(newAnswers)
      setPhase(PHASES.DRUG_DETAILS)
    } else if (key === 'mmcapPrice') {
      setPhase(PHASES.RESULT)
    }
  }

  const calculateResult = () => {
    // Phase 1: Certification check
    if (answers.certified === false) {
      return {
        message: "STOP: Refer to Case Manager for Part A/B enrollment.",
        color: "red",
        shadowClaim: false
      }
    }

    // Phase 2: No insurance
    if (answers.hasInsurance === false) {
      return {
        message: "DIRECT DISPENSE: Bill through MAGELLAN.",
        color: "blue",
        shadowClaim: false
      }
    }

    // Phase 3: Medicare ineligible
    if (answers.insuranceType === 'Medicare' && answers.fpl > 400) {
      return {
        message: "Ineligible for Pharmacy.",
        color: "red",
        shadowClaim: false
      }
    }

    // Phase 4: Drug-specific logic
    if (answers.drugType === DRUG_TYPES.ARV_BRAND) {
      if (answers.insuranceType === 'Medicare') {
        return {
          message: "Primary Insurance → DOH Copay Card",
          color: "blue",
          shadowClaim: false,
          note: "NEVER use Manufacturer Copay Cards for Medicare."
        }
      } else if (answers.insuranceType === 'Commercial') {
        if (answers.isARVOnly === true) {
          return {
            message: "Primary Insurance → Manufacturer Copay Card",
            color: "green",
            shadowClaim: false,
            note: "Only ARV prescribed - No MEDCO needed."
          }
        } else {
          return {
            message: `Primary Insurance → Manufacturer Copay Card → ${answers.path} (for residual)`,
            color: "green",
            shadowClaim: answers.path === 'MEDCO',
            note: answers.path === 'MEDCO' ? "SHADOW CLAIM REQUIRED: Run PI2MEDCO on all prescriptions for reporting." : null
          }
        }
      }
    } else if (answers.drugType === DRUG_TYPES.RW_FORMULARY) {
      if (answers.rwPrimaryStatus === 'denied') {
        return {
          message: "Process full cost through LPAP.",
          color: "green",
          shadowClaim: false
        }
      }

      if (answers.rwPrimaryStatus === 'nonformulary') {
        if (typeof answers.mmcapPrice !== 'number') {
          return { message: "Continue with assessment...", color: "blue", shadowClaim: false }
        }
        if (answers.mmcapPrice >= 50) {
          return { message: "STOP: Seek Supervisor Approval.", color: "red", shadowClaim: false }
        }
        return {
          message: "Primary Insurance → LPAP (COB override)",
          color: "green",
          shadowClaim: false
        }
      }

      // covered
      if (answers.rwPrimaryStatus === 'covered') {
        return {
          message: `Primary Insurance → ${answers.path}`,
          color: answers.path === 'MEDCO' ? "blue" : "green",
          shadowClaim: answers.path === 'MEDCO',
          note: answers.path === 'MEDCO' ? "SHADOW CLAIM REQUIRED: Run PI2MEDCO on all prescriptions for reporting." : null
        }
      }
    } else if (answers.drugType === DRUG_TYPES.NON_RW_FORMULARY) {
      if (typeof answers.mmcapPrice !== 'number') {
        return { message: "Continue with assessment...", color: "blue", shadowClaim: false }
      }

      if (answers.mmcapPrice < 50) {
        if (answers.nonFormularyPrimaryCovered === true) {
          return { message: "Primary Insurance → LPAP", color: "green", shadowClaim: false }
        }
        return { message: "Primary Insurance → LPAP (COB override)", color: "green", shadowClaim: false }
      }

      return { message: "STOP: Seek Supervisor Approval.", color: "red", shadowClaim: false }
    }

    return {
      message: "Continue with assessment...",
      color: "blue",
      shadowClaim: false
    }
  }

  const renderQuestion = () => {
    switch (phase) {
      case PHASES.CERTIFICATION:
        return (
          <div className="w-full">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
              Is the patient Ryan White certified and up to date?
            </h2>
            <div className="flex flex-col gap-4">
              <button
                onClick={() => handleAnswer('certified', true)}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
              >
                YES
              </button>
              <button
                onClick={() => handleAnswer('certified', false)}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
              >
                NO
              </button>
            </div>
          </div>
        )

      case PHASES.INSURANCE:
        if (answers.hasInsurance === null) {
          return (
            <div className="w-full">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
                Does the patient have insurance?
              </h2>
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => handleAnswer('hasInsurance', true)}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                >
                  YES
                </button>
                <button
                  onClick={() => handleAnswer('hasInsurance', false)}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                >
                  NO
                </button>
              </div>
            </div>
          )
        } else {
          return (
            <div className="w-full">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
                Primary Insurance Type?
              </h2>
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => handleAnswer('insuranceType', 'Medicare')}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                >
                  MEDICARE
                </button>
                <button
                  onClick={() => handleAnswer('insuranceType', 'Commercial')}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                >
                  COMMERCIAL
                </button>
              </div>
            </div>
          )
        }

      case PHASES.FPL:
        return (
          <div className="w-full">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
              What is the patient's FPL %?
            </h2>
            <div className="flex flex-col gap-4">
              <input
                ref={fplInputRef}
                type="number"
                placeholder="Enter FPL %"
                className="w-full border-2 border-gray-300 rounded-2xl px-6 py-5 text-xl text-center focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 shadow-md"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = parseFloat(e.target.value)
                    if (!isNaN(value)) {
                      handleAnswer('fpl', value)
                    }
                  }
                }}
              />
              <button
                onClick={() => {
                  const value = parseFloat(fplInputRef.current?.value)
                  if (!isNaN(value)) {
                    handleAnswer('fpl', value)
                  }
                }}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
              >
                CONTINUE
              </button>
            </div>
          </div>
        )

      case PHASES.DRUG_TYPE:
        const isMedicare = answers.insuranceType === 'Medicare'
        return (
          <div className="w-full">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
              What is the drug type?
            </h2>
            {isMedicare && (
              <div className="mb-4 rounded-xl border-2 border-yellow-300 bg-yellow-50 px-4 py-3 text-center">
                <div className="text-sm font-semibold text-yellow-900">⚠️ MEDICARE: Manufacturer Copay Cards are not allowed</div>
              </div>
            )}
            <div className="flex flex-col gap-4">
              <button
                onClick={() => handleAnswer('drugType', DRUG_TYPES.ARV_BRAND)}
                className={`w-full text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98] ${
                  isMedicare ? 'bg-purple-400 cursor-not-allowed opacity-75' : 'bg-purple-500 hover:bg-purple-600'
                }`}
                disabled={false}
                title={isMedicare ? 'Note: Mfg Card not used for Medicare' : ''}
              >
                {isMedicare ? 'ARV/Brand (DOH Copay Only)' : 'ARV/Brand (Mfg Card Eligible)'}
              </button>
              <button
                onClick={() => handleAnswer('drugType', DRUG_TYPES.RW_FORMULARY)}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
              >
                RW FORMULARY DRUG
              </button>
              <button
                onClick={() => handleAnswer('drugType', DRUG_TYPES.NON_RW_FORMULARY)}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
              >
                NON-RW-FORMULARY DRUG
              </button>
            </div>
          </div>
        )

      case PHASES.DRUG_DETAILS:
        if (answers.drugType === DRUG_TYPES.ARV_BRAND && answers.insuranceType === 'Commercial') {
          return (
            <div className="w-full">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
                Is ONLY an ARV prescribed?
              </h2>
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => handleAnswer('isARVOnly', true)}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                >
                  YES (ARV ONLY)
                </button>
                <button
                  onClick={() => handleAnswer('isARVOnly', false)}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                >
                  NO (OTHER DRUGS TOO)
                </button>
              </div>
            </div>
          )
        } else if (answers.drugType === DRUG_TYPES.RW_FORMULARY) {
          // Step 1: ask primary status (covered / denied / primary non-formulary but RW formulary)
          if (answers.rwPrimaryStatus === null) {
            return (
              <div className="w-full">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
                  Primary Insurance status for this RW formulary drug?
                </h2>
                <div className="flex flex-col gap-4">
                  <button
                    onClick={() => handleAnswer('rwPrimaryStatus', 'covered')}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                  >
                    COVERED
                  </button>
                  <button
                    onClick={() => handleAnswer('rwPrimaryStatus', 'nonformulary')}
                    className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                  >
                    NON-FORMULARY (PRIMARY)
                  </button>
                  <button
                    onClick={() => handleAnswer('rwPrimaryStatus', 'denied')}
                    className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                  >
                    DENIED
                  </button>
                </div>
              </div>
            )
          }

          // Step 2 (only for primary non-formulary): MMCAP $50 rule remains
          if (answers.rwPrimaryStatus === 'nonformulary' && typeof answers.mmcapPrice !== 'number') {
            return (
              <div className="w-full">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
                  What is the MMCAP price?
                </h2>
                <div className="flex flex-col gap-4">
                  <input
                    ref={mmcapInputRef}
                    type="number"
                    placeholder="Enter MMCAP price ($)"
                    className="w-full border-2 border-gray-300 rounded-2xl px-6 py-5 text-xl text-center focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 shadow-md"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const value = parseFloat(e.target.value)
                        if (!isNaN(value)) {
                          handleAnswer('mmcapPrice', value)
                        }
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const value = parseFloat(mmcapInputRef.current?.value)
                      if (!isNaN(value)) {
                        handleAnswer('mmcapPrice', value)
                      }
                    }}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                  >
                    CONTINUE
                  </button>
                </div>
              </div>
            )
          }

          // covered/denied/nonformulary+price will resolve via Result phase
          return null
        } else if (answers.drugType === DRUG_TYPES.NON_RW_FORMULARY) {
          // Step 1: RW non-formulary but covered by primary -> Primary -> LPAP (after MMCAP check)
          if (answers.nonFormularyPrimaryCovered === null) {
            return (
              <div className="w-full">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
                  Is this Non-RW-Formulary drug covered by Primary Insurance?
                </h2>
                <div className="flex flex-col gap-4">
                  <button
                    onClick={() => handleAnswer('nonFormularyPrimaryCovered', true)}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                  >
                    YES (COVERED)
                  </button>
                  <button
                    onClick={() => handleAnswer('nonFormularyPrimaryCovered', false)}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                  >
                    NO / NOT COVERED
                  </button>
                </div>
              </div>
            )
          }

          // Step 2: MMCAP $50 rule
          return (
            <div className="w-full">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
                What is the MMCAP price?
              </h2>
              <div className="flex flex-col gap-4">
                <input
                  ref={mmcapInputRef}
                  type="number"
                  placeholder="Enter MMCAP price ($)"
                  className="w-full border-2 border-gray-300 rounded-2xl px-6 py-5 text-xl text-center focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 shadow-md"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = parseFloat(e.target.value)
                      if (!isNaN(value)) {
                        handleAnswer('mmcapPrice', value)
                      }
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const value = parseFloat(mmcapInputRef.current?.value)
                    if (!isNaN(value)) {
                      handleAnswer('mmcapPrice', value)
                    }
                  }}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-6 px-7 rounded-2xl text-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                >
                  CONTINUE
                </button>
              </div>
            </div>
          )
        }
        return null

      case PHASES.RESULT:
        const result = calculateResult()
        const getColorClasses = (color) => {
          switch (color) {
            case 'red':
              return {
                bg: 'bg-red-100',
                border: 'border-red-500',
                text: 'text-red-800',
                textSecondary: 'text-red-700'
              }
            case 'green':
              return {
                bg: 'bg-green-100',
                border: 'border-green-500',
                text: 'text-green-800',
                textSecondary: 'text-green-700'
              }
            case 'blue':
            default:
              return {
                bg: 'bg-blue-100',
                border: 'border-blue-500',
                text: 'text-blue-800',
                textSecondary: 'text-blue-700'
              }
          }
        }
        const colorClasses = getColorClasses(result.color)
        return (
          <div className="text-center">
            <div className={`${colorClasses.bg} border-4 ${colorClasses.border} rounded-lg p-8 max-w-2xl mx-auto mb-6`}>
              <h2 className={`text-4xl font-bold ${colorClasses.text} mb-4`}>
                Billing Decision
              </h2>
              <p className={`text-2xl ${colorClasses.textSecondary} mb-4`}>
                {result.message}
              </p>
              {result.note && (
                <div className="mt-6 p-4 bg-yellow-100 border-2 border-yellow-500 rounded">
                  <p className="text-lg font-semibold text-yellow-800">
                    {result.note}
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={reset}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-lg transition-colors shadow-lg"
            >
              Start Over for New Patient
            </button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-6 px-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            BILL-E
          </h1>
          <p className="text-base md:text-lg text-gray-600 font-medium">
            a pharmacy billing bot
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[70%_30%] gap-6 items-start">
          {/* Action Zone - 70% width */}
          <main className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl border border-gray-200 p-8 md:p-10 min-h-[500px] flex items-center justify-center">
            {renderQuestion()}
          </main>

          {/* Summary Rail - 30% width */}
          <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
            <SummaryRail />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App;

