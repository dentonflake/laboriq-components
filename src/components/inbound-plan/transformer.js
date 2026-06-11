// Retool JS Transformer (NOT a query's "Transform Results" — that won't react
// to other queries finishing). Output binds to the InboundPlan component's
// `rows` prop. This transformer re-runs automatically whenever EITHER of its
// input queries finishes, so it dodges the page-load race condition.
//
// Wire these inputs in Retool:
//   const planRows = formatDataAsArray({{ home__query__getInboundPlans.data }} || [])
//   const programs = formatDataAsArray({{ getProgramsFromBQ.data }} || [])
//
// (the `|| []` guards against the initial undefined state before either query
// has returned — without this, .map() throws and the transformer's value
// stays stuck at undefined.)
//
// Output: [{ weekStart, programId, program, source, programProfile,
//            loadType, loadCount }, ...]

const programNameById = new Map((programs || []).map(p => [p.id, p.name]))

return (planRows || []).map(r => ({
  weekStart: r.weekStart,
  programId: r.programId,
  program: programNameById.get(r.programId) ?? `Program ${r.programId}`,
  source: r.source,
  programProfile: r.programProfile,
  loadType: r.loadType,
  loadCount: r.loadCount
}))
