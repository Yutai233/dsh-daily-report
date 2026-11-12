import { rawLogSource } from '../lib/collect/rawlog.js'
import { collectDay } from '../lib/collect/sessions.js'
const date = process.argv[2]
const t0 = Date.now()
const f = await collectDay(rawLogSource(), date)
console.log('ms', Date.now()-t0)
const brief = { ...f, usageEvents: f.usageEvents.length, sessions: f.sessions.map(s=>({title:s.title, ws:s.workspace, fa:new Date(s.firstActive).toLocaleTimeString(), um:s.userMessages, tc:s.toolCalls, cost:s.costCny, files:s.filesChanged.slice(0,3), fail:s.failures.length, todos:s.openTodos.length, intr:s.interruptedTurns, del:s.deliverables.length})) , commandLabels: f.commandLabels.length, activity:{...f.activity,userMessageTimes:f.activity.userMessageTimes.length}}
brief.tools.top = brief.tools.top.slice(0,6)
console.log(JSON.stringify(brief,null,1).slice(0,6000))
const k = Object.keys(f._packs)[0]; if (k) console.log('\n--- pack sample\n', f._packs[k].slice(0,1500))
