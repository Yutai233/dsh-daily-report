window.__ModuleLoader__.load({
 id: 'dsh-daily-report',
 factory(require) {
 const CSS_TEXT = "/* dsh-daily-report client styles — DSH design tokens only (follows light/dark theme). */\n.ddr-mark{position:relative;display:inline-flex;align-items:center;justify-content:center}\n.ddr-fish{display:block;overflow:visible;color:var(--dsw-alias-label-primary);cursor:pointer;background:none;border:0;padding:0}\n.ddr-fishbtn{position:relative;display:inline-flex;background:none;border:0;padding:0;margin:0;color:inherit;cursor:pointer;border-radius:var(--dsw-radius-sm)}\n.ddr-fishbtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:4px}\n.ddr-dot{position:absolute;top:-2px;right:-6px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary-new-colorprimary-new-color, #5686fe)}\n\n.ddr-card-failure{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:901;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);padding:12px 16px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-prominent);font-size:12px}\n/* Card anchored above the hero logo. Fixed positioning escapes the hero's flex/overflow. */\n.ddr-card{display:flex;flex-direction:column;max-height:calc(100dvh - 32px);position:fixed;z-index:900;width:min(440px,calc(100vw - 32px));box-sizing:border-box;background:var(--dsw-alias-bg-layer-2);border:0;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-panel, 16px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);padding:16px 18px 14px;font-size:13px;line-height:20px;text-align:left;transform-origin:50% 100%;animation:ddr-pop .22s cubic-bezier(.2,.8,.2,1)}\n.ddr-card-scroll{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-gutter:stable;padding-right:4px}\n.ddr-card>.ddr-head{flex:none}\n.ddr-card-scroll:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:2px}\n.ddr-card[data-placement=below]{transform-origin:50% 0}\n.ddr-card::after{content:\"\";position:absolute;left:var(--ddr-arrow-x,50%);bottom:-5px;width:10px;height:10px;margin-left:-5px;background:var(--dsw-alias-bg-layer-2);box-shadow:1px 1px 0 0 var(--dsw-alias-border-l1);transform:rotate(45deg)}\n.ddr-card[data-placement=below]::after{bottom:auto;top:-5px;transform:rotate(225deg)}\n@keyframes ddr-pop{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}\n@media (prefers-reduced-motion:reduce){.ddr-card{animation:none}}\n.ddr-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:0;padding-bottom:6px;border-bottom:.5px solid var(--dsw-alias-border-l2)}\n.ddr-title{font-size:14px;font-weight:600;line-height:22px;display:flex;align-items:center;gap:6px;min-width:0}\n.ddr-title small{font-weight:400;color:var(--dsw-alias-label-tertiary);font-size:12px;min-width:0;flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ddr-title .ddr-wx{color:var(--dsw-alias-label-secondary)}\n.ddr-x{width:24px;height:24px;border-radius:var(--dsw-radius-sm);border:0;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:none}\n@media (hover:hover){.ddr-x:hover{background:var(--dsw-alias-interactive-bg-hover)}}\n.ddr-tip{color:var(--dsw-alias-state-warn-label)}\n.ddr-one{margin:8px 0 6px;font-size:14px;line-height:22px;font-weight:500}\n.ddr-discovery{margin:10px 0 0;padding:8px 10px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary);border-left:2px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color,#5686fe);border-radius:0 6px 6px 0;background:var(--dsw-alias-interactive-bg-hover);overflow-wrap:anywhere}\n.ddr-discovery b{font-weight:500;color:var(--dsw-alias-label-primary)}\n.ddr-discovery-linked{display:inline-block;margin-left:6px;padding:0 5px;border-radius:4px;color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,var(--dsw-alias-brand-primary));background:color-mix(in srgb,var(--dsw-alias-brand-primary-new-colorprimary-new-color,var(--dsw-alias-brand-primary)) 12%,transparent);font-size:10px;line-height:1.5;white-space:nowrap;vertical-align:baseline}\n.ddr-discovery-more{display:inline-flex;align-items:center;margin-left:8px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,var(--dsw-alias-brand-primary));font:inherit;font-size:11px;line-height:18px;cursor:pointer;white-space:nowrap;vertical-align:baseline}\n.ddr-discovery-more:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:currentColor}\n.ddr-discovery-more:focus-visible{outline:2px solid currentColor;outline-offset:2px}\n.ddr-session-link{margin-left:6px;padding:0 6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:5px;background:none;color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#5686fe);font:inherit;font-size:11px;line-height:20px;cursor:pointer;white-space:nowrap;vertical-align:baseline}\n.ddr-session-link:hover{background:var(--dsw-alias-interactive-bg-hover)}\n.ddr-session-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:2px}\n/* 告警胶囊与用量排成一行：胶囊与用量都不收缩，只有放不下时才换行（窄屏/长文案）。 */\n.ddr-alerts{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin:8px 0}\n.ddr-alert{font-size:12px;line-height:18px;padding:1px 7px;border-radius:999px;white-space:nowrap;color:var(--dsw-alias-state-warn-label);background:color-mix(in srgb,var(--dsw-alias-state-warn-label) 10%,transparent)}\n.ddr-usage{display:inline-flex;align-items:center;gap:6px;flex:none;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}\n.ddr-usage b{font-weight:500;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}\n.ddr-usage .ddr-delta{font-variant-numeric:tabular-nums}\n.ddr-usage .ddr-delta.up{color:var(--dsw-alias-state-warn-label)}\n.ddr-usage .ddr-delta.down{color:var(--dsw-alias-state-success-primary)}\n/* 四面棱柱：tokens 面与 bili 面各两张，按同一方向循环向上翻。\n   每 3s 一个台阶（2.4s 停留 + .6s 翻 90°），12s 走完 0→360°，回到 0° 时与起点同相，\n   不会像两面对翻那样倒着回到原面。点一下可以提前翻到下一面（client 里 seek 动画）。 */\n.dr-token-cube{display:inline-grid;flex:0 1 auto;min-width:0;max-width:100%;height:18px;line-height:18px;font-size:12px;color:var(--dsw-alias-label-tertiary);perspective:280px;overflow:hidden;vertical-align:middle;cursor:pointer;user-select:none}\n.dr-token-cube__rotor{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:18px;min-width:0;max-width:100%;transform-style:preserve-3d;transform:translateZ(-9px) rotateX(0deg);animation:dr-token-cube-turn 12s cubic-bezier(.4,0,.2,1) infinite}\n.dr-token-cube__face{grid-area:1/1;min-width:0;max-width:100%;height:18px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;backface-visibility:hidden;background:var(--dsw-alias-bg-layer-2);font-variant-numeric:tabular-nums}\n.dr-token-cube__face--usage{transform:translateZ(9px)}\n.dr-token-cube__face--usage-back{transform:rotateX(-180deg) translateZ(9px)}\n.dr-token-cube__face--bili{transform:rotateX(-90deg) translateZ(9px)}\n.dr-token-cube__face--bili-back{transform:rotateX(-270deg) translateZ(9px)}\n.dr-token-cube__face--bili,.dr-token-cube__face--bili-back{font-weight:500;color:var(--dsw-alias-label-secondary)}\n.dr-token-cube .ddr-usage{max-width:100%;white-space:nowrap}\n.dr-token-cube .ddr-usage b{min-width:0;overflow:hidden;text-overflow:ellipsis}\n.dr-token-cube .ddr-delta{flex:none}\n@keyframes dr-token-cube-turn{\n  0%,20%{transform:translateZ(-9px) rotateX(0deg)}\n  25%,45%{transform:translateZ(-9px) rotateX(90deg)}\n  50%,70%{transform:translateZ(-9px) rotateX(180deg)}\n  75%,95%{transform:translateZ(-9px) rotateX(270deg)}\n  100%{transform:translateZ(-9px) rotateX(360deg)}\n}\n/* Reset instead of freezing a half-turn; leaving restarts a full reading cycle. */\n@media (prefers-reduced-motion:no-preference){\n  .dr-token-cube[data-hidden=true] .dr-token-cube__rotor,.dr-token-cube[data-paused=true] .dr-token-cube__rotor{animation:none;transform:translateZ(-9px) rotateX(0deg)}\n}\n@media (prefers-reduced-motion:reduce){\n  .dr-token-cube{cursor:default}\n  .dr-token-cube__rotor{display:flex;align-items:center;gap:4px;animation:none;transform:none;transform-style:flat}\n  .dr-token-cube__face--usage{flex:0 1 auto;transform:none}\n  .dr-token-cube__face--bili{flex:0 1 auto;transform:none;font-size:11px}\n  .dr-token-cube__face--bili::before{content:\"· \"}\n  .dr-token-cube__face--usage-back,.dr-token-cube__face--bili-back{display:none}\n}\n@supports not (transform-style:preserve-3d){\n  .dr-token-cube__rotor{animation:none;transform:none}\n  .dr-token-cube__face--usage{transform:none}\n  .dr-token-cube__face--usage-back,.dr-token-cube__face--bili,.dr-token-cube__face--bili-back{display:none}\n}\n/* 告警胶囊也走同一套轮转：多条提醒共用一格宽度（最宽那条），相邻两条交替露出，\n   跟用量排在同一行；点一下同样提前翻面。延迟半个台阶，避免和 token 棱柱同时翻。\n   胶囊底色和面用同一个填充色：翻面时只有文字在转，橙色圆角矩形本身不动、宽度也不变。 */\n.dr-alert-cube{--ddr-alert-fill:color-mix(in srgb,var(--dsw-alias-state-warn-label) 10%,var(--dsw-alias-bg-layer-2,#1f1f1f));display:inline-grid;flex:0 0 auto;min-width:0;max-width:100%;height:20px;line-height:18px;padding:1px 7px;box-sizing:border-box;border-radius:999px;font-size:12px;color:var(--dsw-alias-state-warn-label);background:var(--ddr-alert-fill);perspective:280px;overflow:hidden;vertical-align:middle;cursor:pointer;user-select:none}\n.dr-alert-cube__rotor{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:18px;min-width:0;max-width:100%;transform-style:preserve-3d;transform:translateZ(-9px) rotateX(0deg);animation:dr-token-cube-turn 12s cubic-bezier(.4,0,.2,1) infinite;animation-delay:-1.5s}\n/* 面必须不透明，翻面时近面才能盖住远面；填充色与胶囊一致，转动时看不见矩形边缘。 */\n.dr-alert-cube__face{grid-area:1/1;min-width:0;max-width:100%;height:18px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;backface-visibility:hidden;background:var(--ddr-alert-fill)}\n.dr-alert-cube__face--0{transform:translateZ(9px)}\n.dr-alert-cube__face--1{transform:rotateX(-90deg) translateZ(9px)}\n.dr-alert-cube__face--2{transform:rotateX(-180deg) translateZ(9px)}\n.dr-alert-cube__face--3{transform:rotateX(-270deg) translateZ(9px)}\n@media (prefers-reduced-motion:reduce){\n  .dr-alert-cube{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 6px;height:auto;padding:0;background:none;border-radius:0;overflow:visible;cursor:default}\n  .dr-alert-cube__rotor{display:contents;animation:none;transform:none}\n  .dr-alert-cube__face{display:inline-block;height:auto;padding:1px 7px;border-radius:999px;background:var(--ddr-alert-fill)}\n  .dr-alert-cube__face--0,.dr-alert-cube__face--1,.dr-alert-cube__face--2,.dr-alert-cube__face--3{transform:none}\n  .dr-alert-cube__face.is-duplicate{display:none}\n}\n@supports not (transform-style:preserve-3d){\n  .dr-alert-cube{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 6px;height:auto;padding:0;background:none;border-radius:0;overflow:visible}\n  .dr-alert-cube__rotor{display:contents;animation:none;transform:none}\n  .dr-alert-cube__face{display:inline-block;height:auto;padding:1px 7px;border-radius:999px;background:var(--ddr-alert-fill)}\n  .dr-alert-cube__face--0,.dr-alert-cube__face--1,.dr-alert-cube__face--2,.dr-alert-cube__face--3{transform:none}\n  .dr-alert-cube__face.is-duplicate{display:none}\n}\n.ddr-gen{font-variant-numeric:tabular-nums}\n.ddr-list{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:4px}\n.ddr-list li{display:grid;grid-template-columns:40px minmax(0,1fr);gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}\n.ddr-list li span:first-child{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}\n.ddr-list li b{color:var(--dsw-alias-label-primary);font-weight:500}\n.ddr-carry{margin-top:10px;padding-top:8px;border-top:.5px solid var(--dsw-alias-border-l2)}\n/* 待续区默认只露出两条：真实高度由脚本按前两条测量后写入内联 max-height（≤2 条时清除）。 */\n.ddr-carry-scroll{margin-top:8px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-gutter:stable}\n.ddr-carry-scroll>.ddr-list{margin-top:0}\n.ddr-carry-scroll:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:2px}\n.ddr-carry h4{margin:0 0 4px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary)}\n/* 节日胶囊：字号与「明日待续」标题一致（12px），底色/字色/描边由 festival.js 的主题以内联样式给出。 */\n.ddr-carry h4.ddr-fest-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n.ddr-fest{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:var(--dsw-radius-sm);font-size:12px;font-weight:500;line-height:20px;white-space:nowrap}\n.ddr-fest-note{font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}\n.ddr-actions{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:12px}\n.ddr-actions .ddr-meta{margin-right:auto;font-size:11px;color:var(--dsw-alias-label-tertiary)}\n.ddr-btn{box-sizing:border-box;height:28px;padding:0 10px;border-radius:var(--dsw-radius-sm);border:0;background:transparent;box-shadow:inset 0 0 0 var(--dsh-hairline-width, .5px) var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;white-space:nowrap}\n.ddr-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}\n.ddr-btn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}\n.ddr-btn.primary{background:var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-foreground);box-shadow:none;font-weight:500}\n.ddr-btn.primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover, var(--dsw-alias-brand-primary))}\n.ddr-btn:disabled{cursor:not-allowed;opacity:.4}\n.ddr-empty{color:var(--dsw-alias-label-secondary);font-size:12px;margin:6px 0}\n.ddr-shimmer{color:var(--dsw-alias-label-tertiary)}\n\n/* Report viewer modal */\n/* Settings panel geometry from dsh-client-ui-settings-general. */\n.ddr-viewer{position:fixed;inset:0;z-index:1002;display:flex;align-items:center;justify-content:center;font-family:var(--dsw-font-family,system-ui,sans-serif);padding-top:var(--dsh-frame-overlay-top,0px)}\n.ddr-viewer-mask{position:absolute;inset:var(--dsh-frame-overlay-top,0px) 0 0;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}\n.ddr-viewer-panel{position:relative;flex:none;width:800px;max-width:calc(100vw - 48px);height:min(800px,calc(100vh - 2 * max(24px,var(--dsh-frame-overlay-top,24px))));background:var(--dsw-alias-bg-layer-2);border-radius:var(--dsw-radius-panel,28px);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);display:flex;flex-direction:column;overflow:hidden;border:0}\n.ddr-viewer-content{position:relative;display:flex;flex-direction:column;flex:none;width:var(--ddr-content-width,100%);height:var(--ddr-content-height,100%);min-height:0}\n.ddr-viewer-panel[data-motion=closing]{pointer-events:none}\n.ddr-viewer-head{display:flex;align-items:center;gap:8px;padding:18px 24px;border-bottom:.5px solid var(--dsw-alias-border-l2)}\n.ddr-viewer-head h3{margin:0;font-size:16px;font-weight:600;line-height:24px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-state-business-primary,#5686fe)}\n.ddr-viewer iframe{flex:1;border:0;width:100%;background:transparent}\n\n/* Settings section */\n.ddr-set{display:flex;flex-direction:column;width:100%;color:var(--dsw-alias-label-primary)}\n.ddr-group{padding:8px 0 4px}\n.ddr-group+.ddr-group{border-top:.5px solid var(--dsw-alias-border-l2);margin-top:8px}\n.ddr-group>h3{margin:12px 0 2px;font-size:13px;font-weight:600;line-height:20px}\n.ddr-group>p{margin:0 0 4px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}\n.ddr-row{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:14px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}\n.ddr-row:last-child{border-bottom:0}\n.ddr-row.stack{flex-direction:column;align-items:stretch;gap:10px}\n.ddr-row-text{min-width:0;flex:1}\n.ddr-row-title{font-size:14px;line-height:20px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}\n.ddr-row-desc{color:var(--dsw-alias-label-secondary);margin-top:4px;font-size:12px;line-height:18px}\n.ddr-row-ctl{flex:none;display:flex;align-items:center;gap:8px}\n.ddr-badge{font-size:11px;line-height:16px;padding:0 6px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);font-weight:400}\n.ddr-badge.blue{color:var(--dsw-alias-label-primary-bluish);background:var(--dsw-alias-state-business-tertiary);border-color:transparent}\n.ddr-choices{display:grid;gap:8px}\n.ddr-choice{display:grid;grid-template-columns:18px minmax(0,1fr);gap:10px;align-items:start;padding:10px 12px;border-radius:var(--dsw-radius-lg);border:.5px solid var(--dsw-alias-border-l3);cursor:pointer;background:transparent;text-align:left;color:inherit;font:inherit}\n@media (hover:hover){.ddr-choice:hover{background:var(--dsw-alias-interactive-bg-hover)}}\n.ddr-choice[aria-checked=true]{border-color:var(--dsw-alias-border-l4);background:var(--dsw-alias-interactive-bg-hover)}\n.ddr-radio{width:16px;height:16px;margin-top:2px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l4);box-sizing:border-box;position:relative}\n.ddr-choice[aria-checked=true] .ddr-radio{border-color:var(--dsw-alias-brand-primary)}\n.ddr-choice[aria-checked=true] .ddr-radio::after{content:\"\";position:absolute;inset:3px;border-radius:50%;background:var(--dsw-alias-brand-primary)}\n.ddr-choice b{display:block;font-size:13px;font-weight:500;line-height:20px}\n.ddr-choice span.d{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:2px}\n.ddr-sub{display:grid;gap:8px;padding:10px 12px;border-radius:var(--dsw-radius-lg);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l2)}\n.ddr-field{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;align-items:center;font-size:12px;color:var(--dsw-alias-label-secondary)}\n.ddr-input,.ddr-select{box-sizing:border-box;height:30px;min-width:0;padding:0 10px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}\n.ddr-input:focus,.ddr-select:focus{border-color:var(--dsw-alias-border-l4)}\n.ddr-select option{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}\n.ddr-input.num{width:88px;font-variant-numeric:tabular-nums}\n.ddr-input.time{width:96px}\n.ddr-seg{display:inline-flex;padding:2px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);gap:2px}\n.ddr-seg button{height:26px;padding:0 10px;border:0;border-radius:calc(var(--dsw-radius-md) - 2px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}\n.ddr-seg button[aria-checked=true]{background:var(--dsw-alias-button-elevated-fill, var(--dsw-alias-bg-layer-3));color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-soft)}\n.ddr-switch{position:relative;width:36px;height:20px;border-radius:999px;border:0;padding:0;cursor:pointer;background:var(--dsw-alias-border-l3);transition:background .15s;flex:none}\n.ddr-switch::after{content:\"\";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb);transition:transform .15s}\n.ddr-switch[aria-checked=true]::after{background:var(--dsw-alias-label-primary-foreground)}\n.ddr-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}\n.ddr-switch[aria-checked=true]::after{transform:translateX(16px)}\n.ddr-switch:disabled{opacity:.5;cursor:default}\n.ddr-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}\n.ddr-ok{color:var(--dsw-alias-state-success-primary)}\n.ddr-err{color:var(--dsw-alias-state-error-primary)}\n.ddr-reports{display:grid;gap:2px;max-height:240px;overflow:auto}\n.ddr-report{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--dsw-radius-md);font-size:13px}\n@media (hover:hover){.ddr-report:hover{background:var(--dsw-alias-interactive-bg-hover)}}\n.ddr-report span{flex:1;min-width:0;font-variant-numeric:tabular-nums}\n.ddr-link{border:0;background:none;padding:0 4px;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}\n.ddr-link:hover{color:var(--dsw-alias-label-primary)}\n.ddr-tabs{display:flex;gap:4px;margin-bottom:6px}\n.ddr-saved{font-size:12px;color:var(--dsw-alias-state-success-primary);transition:opacity .3s}\n.ddr-set-tabs{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:2px 0 10px;border-bottom:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}\n.ddr-set-tablist{display:flex;gap:6px;flex-wrap:wrap}\n.ddr-set-links{display:flex;align-items:center;gap:12px;margin-left:auto;font-size:12px;white-space:nowrap}\n.ddr-set-link{color:var(--dsw-alias-label-secondary);text-decoration:none;cursor:pointer}\n.ddr-set-link:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}\n.ddr-set-star{color:var(--dsw-alias-brand-primary)}\n.ddr-set-version{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}\n.ddr-set-tab{height:30px;padding:0 14px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer}\n.ddr-set-tab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}\n.ddr-set-tab[aria-selected=true]{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l2)}\n.ddr-set-hint{margin:0 0 2px}\n\n/* Constrain intrinsic control widths to the settings pane, not the viewport. */\n.ddr-root{overflow-wrap:anywhere}\n.ddr-set{min-width:0;container-type:inline-size}\n.ddr-root *{box-sizing:border-box}\n.ddr-row-ctl{min-width:0;max-width:100%;flex-wrap:wrap;justify-content:flex-end}\n.ddr-row-ctl>.ddr-seg{max-width:100%}\n.ddr-input,.ddr-select{max-width:100%}\n.ddr-field>.ddr-input,.ddr-field>.ddr-select{width:100%}\n.ddr-row.stack>.ddr-input,.ddr-row.stack>div>.ddr-input:not(.num){width:100%}\n.ddr-seg{max-width:100%;flex-wrap:wrap}\n.ddr-report{flex-wrap:wrap;min-width:0}\n.ddr-report>span{flex:1 1 140px;overflow-wrap:anywhere}\n.ddr-report>.ddr-link{flex:none;min-height:28px}\n.ddr-reports{min-width:0;max-width:100%}\n.ddr-actions{flex-wrap:wrap}\n.ddr-alerts>*{min-width:0}\n.ddr-title{flex-wrap:wrap}\n.ddr-fallback{margin:4px 0 8px}\n.ddr-wx{font-variant-numeric:tabular-nums}\n.ddr-viewer-head{flex-wrap:wrap}\n.ddr-viewer-head h3{white-space:normal;overflow-wrap:anywhere;flex:1 1 100%}\n.ddr-viewer-head .ddr-x{margin-left:auto}\n.ddr-viewer iframe{min-height:0}\n.ddr-viewer-status{padding:4px 16px;margin:0}\n.ddr-viewer-status[role=status]{position:absolute;inset:120px 0 auto;z-index:1;pointer-events:none;text-align:center}\n.ddr-root button:focus-visible,.ddr-root input:focus-visible,.ddr-root select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:2px}\n@container (max-width:520px){\n  .ddr-row:not(.stack){flex-wrap:wrap;gap:10px}\n  .ddr-row-text{flex-basis:100%}\n  .ddr-row-ctl{justify-content:flex-start}\n  .ddr-field{grid-template-columns:minmax(0,1fr);gap:4px}\n}\n.ddr-report-directory{margin:14px 0 18px;padding:14px;border-radius:var(--dsw-radius-lg,12px);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l2)}\n.ddr-report-directory .ddr-field{grid-template-columns:110px minmax(0,1fr)}\n.ddr-directory-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}\n.ddr-root{font-family:var(--dsw-font-family,system-ui,sans-serif)}\n.ddr-btn,.ddr-link,.ddr-x{transition:background .16s ease,color .16s ease,box-shadow .16s ease}\n@media (max-width:767px){\n  html:not([data-windows-titlebar]):not([data-platform=darwin]) .ddr-viewer-panel{width:100%;max-width:100%;height:100%;border-radius:0}\n}\n@media (max-width:480px){\n  .ddr-viewer-head{padding:14px 16px}\n  .ddr-card{max-height:calc(100dvh - 32px)}\n}\n@media (prefers-reduced-motion:reduce){\n  .ddr-root *,.ddr-root *::before,.ddr-root *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}\n}\n";
 const __DDR_VERSION__ = "0.3.5";
// Static silhouette bundled alongside the swim frames, independent of runtime exports.
const HERO_REST_PATH = "M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z";
// Hover swim keyframes copied from @deepseek-ai/dsh-client-ui-conversation (HeroFish) so the replacement mark animates exactly like the stock one.
const HERO_SWIM_UP_PATH = "M22.403 0.567C22.145 0.477 22.068 0.718 21.939 0.85C21.895 0.893 21.86 0.947 21.824 0.997C21.515 1.421 21.13 1.721 20.591 1.77C19.829 1.867 19.221 2.244 18.712 2.958C18.535 2.227 18.116 1.839 17.516 1.626C17.203 1.506 16.887 1.379 16.663 1.064C16.508 0.839 16.462 0.581 16.383 0.329C16.332 0.176 16.283 0.02 16.121 -0.002C15.944 -0.029 15.875 0.133 15.805 0.269C15.52 0.822 15.408 1.43 15.42 2.046C15.449 3.432 16.031 4.532 17.202 5.274C17.337 5.356 17.374 5.445 17.335 5.582C17.261 5.862 17.169 6.134 17.086 6.413C17.032 6.59 16.952 6.63 16.764 6.558C16.118 6.301 15.562 5.909 15.074 5.433C14.248 4.633 13.5 3.751 12.568 3.06C12.349 2.898 12.13 2.748 11.903 2.605C10.952 1.682 12.028 0.923 12.277 0.833C12.537 0.739 12.367 0.416 11.526 0.42C10.684 0.424 9.914 0.706 8.933 1.081C8.789 1.138 8.638 1.179 8.484 1.213C7.593 1.044 6.668 1.006 5.702 1.115C3.883 1.318 2.43 2.178 1.362 3.646C0.079 5.41 -0.223 7.415 0.147 9.506C0.535 11.71 1.66 13.535 3.389 14.962C5.181 16.441 7.246 17.166 9.601 17.027C11.032 16.944 12.624 16.753 14.421 15.232C14.874 15.458 15.35 15.548 16.138 15.615C16.746 15.672 17.331 15.585 17.784 15.491C18.493 15.341 18.444 14.684 18.188 14.564C16.108 13.595 16.565 13.989 16.15 13.67C17.206 12.42 18.82 10.198 19.363 7.086C19.421 6.709 19.484 6.171 19.469 5.866C19.458 5.681 19.493 5.604 19.681 5.556C20.199 5.412 20.691 5.172 21.125 4.806C22.366 3.824 22.758 2.554 22.708 1.1C22.7 0.878 22.649 0.654 22.403 0.567ZM11.175 14.451C9.159 12.726 8.182 12.088 7.778 12.067C7.401 12.047 7.469 12.505 7.552 12.807C7.639 13.103 7.752 13.313 7.91 13.581C8.02 13.758 8.095 14.01 7.801 14.16C7.152 14.487 6.023 13.806 5.97 13.772C4.657 12.85 3.559 11.766 2.785 10.369C2.037 9.025 1.603 7.583 1.532 6.044C1.513 5.672 1.622 5.541 1.992 5.473C2.479 5.383 2.981 5.364 3.468 5.436C5.525 5.736 7.276 6.675 8.744 8.323C9.582 9.299 10.216 10.425 10.869 11.496C11.563 12.592 12.31 13.603 13.262 14.414C13.598 14.696 13.866 14.91 14.123 15.068C13.349 15.154 12.058 15.167 11.175 14.452L11.175 14.451ZM12.141 8.26C12.141 8.095 12.273 7.963 12.439 7.963C12.476 7.963 12.511 7.971 12.541 7.982C12.582 7.997 12.62 8.019 12.65 8.053C12.704 8.106 12.733 8.181 12.733 8.26C12.733 8.425 12.601 8.556 12.435 8.556C12.27 8.556 12.141 8.425 12.141 8.26ZM15.142 9.799C14.949 9.878 14.757 9.945 14.572 9.953C14.284 9.968 13.972 9.851 13.802 9.709C13.537 9.487 13.348 9.363 13.27 8.977C13.236 8.812 13.255 8.556 13.284 8.41C13.352 8.094 13.277 7.892 13.055 7.708C12.873 7.558 12.643 7.516 12.39 7.516C12.296 7.516 12.209 7.475 12.145 7.441C12.039 7.389 11.952 7.257 12.035 7.096C12.062 7.043 12.19 6.916 12.22 6.893C12.563 6.698 12.96 6.762 13.326 6.908C13.665 7.047 13.922 7.302 14.292 7.663C14.669 8.098 14.738 8.218 14.953 8.545C15.123 8.801 15.277 9.063 15.383 9.364C15.447 9.551 15.364 9.705 15.142 9.799Z";
const HERO_SWIM_DOWN_PATH = "M23.271 2.216C23.039 2.071 22.91 2.287 22.755 2.388C22.703 2.42 22.656 2.464 22.61 2.505C22.214 2.848 21.771 3.054 21.225 2.956C20.412 2.784 19.68 2.919 19.005 3.435C18.92 2.663 18.493 2.157 17.808 1.798C17.446 1.621 17.08 1.449 16.83 1.111C16.656 0.872 16.611 0.612 16.524 0.354C16.469 0.198 16.414 0.039 16.223 0.009C16.017 -0.024 15.936 0.137 15.856 0.271C15.539 0.822 15.418 1.43 15.429 2.046C15.454 3.432 16.041 4.538 17.196 5.36C17.325 5.456 17.356 5.547 17.312 5.674C17.229 5.936 17.134 6.191 17.051 6.454C16.999 6.623 16.921 6.659 16.738 6.58C16.107 6.306 15.56 5.909 15.074 5.433C14.248 4.633 13.5 3.751 12.568 3.06C12.349 2.898 12.13 2.748 11.903 2.605C10.952 1.682 12.028 0.923 12.277 0.833C12.537 0.739 12.367 0.416 11.526 0.42C10.684 0.424 9.914 0.706 8.933 1.081C8.789 1.138 8.638 1.179 8.484 1.213C7.593 1.044 6.668 1.006 5.702 1.115C3.883 1.318 2.43 2.178 1.362 3.646C0.079 5.41 -0.223 7.415 0.147 9.506C0.535 11.71 1.66 13.535 3.389 14.962C5.181 16.441 7.246 17.166 9.601 17.027C11.032 16.944 12.624 16.753 14.421 15.232C14.874 15.458 15.35 15.548 16.138 15.615C16.746 15.672 17.331 15.585 17.784 15.491C18.493 15.341 18.444 14.684 18.188 14.564C16.108 13.595 16.565 13.989 16.15 13.67C17.206 12.42 18.82 10.198 19.278 7.246C19.318 6.948 19.375 6.534 19.371 6.293C19.371 6.145 19.411 6.092 19.597 6.098C20.113 6.109 20.619 6.051 21.096 5.891C22.503 5.375 23.169 4.232 23.448 2.804C23.49 2.586 23.491 2.356 23.271 2.216ZM11.175 14.49C9.159 13.005 8.182 12.567 7.778 12.621C7.401 12.673 7.469 13.087 7.552 13.354C7.639 13.619 7.752 13.797 7.91 14.024C8.02 14.175 8.095 14.406 7.801 14.609C7.152 15.063 6.023 14.63 5.97 14.609C4.657 13.941 3.559 12.965 2.785 11.569C2.037 10.225 1.603 8.783 1.532 7.244C1.513 6.872 1.622 6.741 1.992 6.673C2.479 6.583 2.981 6.564 3.468 6.636C5.525 6.936 7.276 7.843 8.744 9.163C9.582 9.888 10.216 10.783 10.869 11.679C11.563 12.659 12.31 13.617 13.262 14.415C13.598 14.696 13.866 14.91 14.123 15.068C13.349 15.155 12.058 15.177 11.175 14.491L11.175 14.49ZM12.141 8.26C12.141 8.095 12.273 7.963 12.439 7.963C12.476 7.963 12.511 7.971 12.541 7.982C12.582 7.997 12.62 8.019 12.65 8.053C12.704 8.106 12.733 8.181 12.733 8.26C12.733 8.425 12.601 8.556 12.435 8.556C12.27 8.556 12.141 8.425 12.141 8.26ZM15.142 9.799C14.949 9.878 14.757 9.945 14.572 9.953C14.284 9.968 13.972 9.851 13.802 9.709C13.537 9.487 13.348 9.363 13.27 8.977C13.236 8.812 13.255 8.556 13.284 8.41C13.352 8.094 13.277 7.892 13.055 7.708C12.873 7.558 12.643 7.516 12.39 7.516C12.296 7.516 12.209 7.475 12.145 7.441C12.039 7.389 11.952 7.257 12.035 7.096C12.062 7.043 12.19 6.916 12.22 6.893C12.563 6.698 12.96 6.762 13.326 6.908C13.665 7.047 13.922 7.302 14.292 7.663C14.669 8.098 14.738 8.218 14.953 8.545C15.123 8.801 15.277 9.063 15.383 9.364C15.447 9.551 15.364 9.705 15.142 9.799Z";

const React = require('react');
const ReactDOM = require('react-dom');
const P = require('@deepseek-ai/dsh-client-ui-primitives');
const h = React.createElement;
const { useState, useEffect, useRef, useCallback, useSyncExternalStore, useLayoutEffect } = React;
// Injected by client/build.mjs from package.json; fallback keeps direct-source tests working.
const PLUGIN_VERSION = typeof __DDR_VERSION__ !== 'undefined' ? __DDR_VERSION__ : '0.3.4';

/* ---------------------------------------------------------------- store */

function makeStore(connection, navigateSession) {
  const listeners = new Set();
  let snap = { phase: 'loading', state: null, error: null, refreshError: null, busy: null, viewer: null, cardOpen: false, autoShown: false };
  const publish = (patch) => { snap = { ...snap, ...patch }; for (const fn of listeners) fn(); };
  async function call(method, payload) {
    const result = await connection.rpc.call('/api', 'daily-report/' + method, payload || {});
    if (!result || !result.ok) throw new Error((result && result.error && (result.error.message || result.error.code)) || 'RPC failed');
    return result.value;
  }
  let timer = null;
  let alive = true;
  async function refresh(opts) {
    try {
      const state = await call('state', opts || {});
      if (state.dataBytes === null && snap.state) state.dataBytes = snap.state.dataBytes;
      const next = { phase: 'ready', state, refreshError: null };
      // Auto-open the morning card once per page when the host says it is due.
      if (state.showCard && !snap.autoShown) { next.cardOpen = true; next.autoShown = true; }
      publish(next);
    } catch (e) {
      publish({ phase: snap.state ? 'ready' : 'error', refreshError: String(e.message || e) });
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!alive) return;
    // Poll faster while the host is generating so the card appears promptly.
    const ms = snap.state && snap.state.generating ? 4000 : 60000;
    timer = setTimeout(() => { refresh().finally(schedule); }, ms);
  }
  let viewRequest = 0;
  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get() { return snap; },
    call,
    start() { refresh().finally(schedule); },
    refresh,
    openCard() { publish({ cardOpen: true }); },
    closeCard(dismiss) {
      publish({ cardOpen: false });
      if (dismiss) call('dismiss').catch(() => {});
    },
    async generate(kind, extra) {
      publish({ busy: kind, error: null });
      try {
        const v = await call('generate', { kind, ...(extra || {}) });
        await refresh();
        return v;
      } catch (e) {
        publish({ error: String(e.message || e) });
        throw e;
      } finally {
        publish({ busy: null });
      }
    },
    async patch(cfg) {
      const v = await call('config', cfg);
      publish({ state: { ...snap.state, config: v.config, ...(v.reportsDir ? { reportsDir: v.reportsDir } : {}) } });
      if (Object.prototype.hasOwnProperty.call(cfg, 'reportsDir')) await refresh({ withSize: true });
      return v.config;
    },
    async view(kind, key, title, trigger, focus) {
      const request = ++viewRequest;
      const origin = captureViewerOrigin(trigger);
      publish({ error: null });
      try {
        const v = await call('report', { kind, key });
        if (!alive || request !== viewRequest) return;
        if (!v || typeof v.html !== 'string' || !v.html.trim()) throw new Error('报告内容为空，请重新生成后再试。');
        publish({ viewer: { id: request, title: title || key, html: v.html, kind, key, origin, focus: focus || null, sessionIds: reportSessionIds(v.report || v.card) } });
      } catch (e) { if (alive && request === viewRequest) publish({ error: '无法查看报告：' + String(e.message || e) }); }
    },
    async open(kind, key, format) {
      publish({ error: null });
      try { await call('open', { kind, key, ...(format ? { format } : {}) }); }
      catch (e) { publish({ error: '无法打开报告：' + String(e.message || e) }); }
    },
    clearError() { publish({ error: null }); },
    showHtml(title, html, kind, key, trigger, sessionIds = []) {
      if (typeof html !== 'string' || !html.trim()) { publish({ error: '报告内容为空，请重新生成后再试。' }); return; }
      ++viewRequest;
      publish({ error: null, viewer: { id: viewRequest, title, html, kind, key, origin: captureViewerOrigin(trigger), sessionIds: sessionIds.filter((id) => typeof id === 'string' && id.trim()) } });
    },
    async openSession(sessionId) {
      publish({ error: null });
      try {
        if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('没有可关联的会话');
        if (typeof navigateSession !== 'function') throw new Error('当前 DSH 不支持会话跳转，请更新后再试');
        await navigateSession(sessionId);
        if (!alive) return;
        ++viewRequest;
        publish({ viewer: null, cardOpen: false });
      } catch (e) { if (alive) publish({ error: '无法打开相关会话：' + String(e.message || e) }); }
    },
    closeViewer() { ++viewRequest; publish({ viewer: null }); },
    dispose() { alive = false; ++viewRequest; clearTimeout(timer); listeners.clear(); },
  };
}

/* ---------------------------------------------------------------- helpers */

const PRIVACY_LABEL = { cloud: '云端模型摘要', 'local-only': '仅统计（不出本机）', 'local-model': '本地模型摘要' };
// 节日胶囊：主题色来自 lib/collect/festival.js 的 theme（底色 / 字色 / 描边 / 可选纹理），
// 没主题的节日在白底上仍是白底，这是有意的——胶囊要跳出来。
const festStyle = (f) => {
  const t = (f && f.theme) || {};
  const s = { borderWidth: 1, borderStyle: 'solid', borderColor: t.border || '#d1d5db', background: t.bg || '#ffffff', color: t.fg || '#3a3a3a' };
  if (t.deco) s.backgroundImage = t.deco;
  if (t.mono) s.fontFamily = 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Cascadia Mono","Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",monospace';
  return s;
};
const fmtClock = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const fmtBytes = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';

/** Compact Chinese token units; the backend's net figure already deducts compression cost. */
function formatBiliTokens(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n > 0 && n < 1) return '<1';
  // Promote rounded boundary values rather than displaying "10000万".
  if (n >= 99995000) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿';
  if (n >= 9999.5) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
  return String(Math.round(n));
}

/** bili-c 面板自己的写法（K/M/B，逐位取整规则相同）；累计净省照抄面板才不会读成两个数。 */
function formatBiliPanelTokens(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return Math.round(n / 1e3) + 'K';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

/** Hidden pages do not spend animation frames; unmount always removes the listener. */
function bindTokenCubeVisibility(node) {
  if (!node) return;
  const sync = () => { node.dataset.hidden = document.hidden ? 'true' : 'false'; };
  sync();
  document.addEventListener('visibilitychange', sync);
  return () => document.removeEventListener('visibilitychange', sync);
}

// Each 3s step holds a face for 2.4s and spends .6s turning 90° upward; the
// animation walks 0→360° so it never unwinds backwards.
const CUBE_STEP_MS = 3000;
const CUBE_HOLD_MS = 2400;
// 卡片里的每日发现只放开头这些字，剩下的交给「详细内容→」跳进完整报告去读。
const DISCOVERY_PREVIEW_CHARS = 60;

/** Clicking a cuboid turns it now instead of waiting out the remaining hold:
 * seek to the next .6s turn window inside the running CSS animation. */
function advanceTokenCube(event) {
  const rotor = event?.currentTarget?.querySelector?.('.dr-token-cube__rotor, .dr-alert-cube__rotor');
  const [animation] = rotor?.getAnimations?.() || [];
  const now = animation ? Number(animation.currentTime) : NaN;
  if (!Number.isFinite(now)) return; // paused/hidden/reduced-motion: nothing to advance
  // 负延迟（告警胶囊错开半个台阶）不体现在 currentTime 里，先换算成动画本地时间再找台阶，
  // 否则会把视图直接 seek 到某一面的停留段，看起来像“文字瞬间变了”。
  const delay = Number(animation.effect?.getTiming?.().delay) || 0;
  const local = now - delay;
  const turn = CUBE_HOLD_MS + CUBE_STEP_MS * Math.floor((local - CUBE_HOLD_MS) / CUBE_STEP_MS);
  const turnMs = CUBE_STEP_MS - CUBE_HOLD_MS;
  if (local >= turn && local < turn + turnMs) return; // 正在翻面，让它把这 0.6s 转完
  animation.currentTime = (turn > local ? turn : turn + CUBE_STEP_MS) + delay;
}

/** Capture before any RPC await; DOMRects themselves must not be kept live. */
function captureViewerOrigin(trigger) {
  if (trigger?.rect && trigger?.element) return trigger;
  if (!trigger?.getBoundingClientRect) return null;
  const r = trigger.getBoundingClientRect();
  if (![r.left, r.top, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0) return null;
  return { element: trigger, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
}

/** One surface grows out of the opener. Content is clipped, never stretched. */
function createViewerMotion(panel, mask, content, origin, onClosed) {
  content.inert = false;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let resting = panel.getBoundingClientRect();
  const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  let restCenter = center(resting);
  let animations = [], closing = false, disposed = false, closed = false, revision = 0;
  const canAnimate = () => !media.matches && typeof panel.animate === 'function';
  const clear = () => {
    ++revision;
    for (const a of animations) a.cancel();
    animations = [];
    panel.style.removeProperty('--ddr-content-width');
    panel.style.removeProperty('--ddr-content-height');
    panel.style.removeProperty('will-change');
  };
  const freezeContent = () => {
    panel.style.setProperty('--ddr-content-width', resting.width + 'px');
    panel.style.setProperty('--ddr-content-height', resting.height + 'px');
    panel.style.willChange = 'width,height,transform';
  };
  const validRect = (r) => r && [r.left, r.top, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0 && r.left < window.innerWidth && r.top < window.innerHeight && r.left + r.width > 0 && r.top + r.height > 0;
  const shape = (r, radius) => {
    const c = center(r);
    return { width: r.width + 'px', height: r.height + 'px', transform: `translate(${c.x - restCenter.x}px,${c.y - restCenter.y}px)`, borderRadius: radius };
  };
  const radius = window.getComputedStyle(panel).borderRadius;
  const play = (node, frames, duration, easing) => {
    const a = node.animate(frames, { duration, easing, fill: 'both' });
    animations.push(a);
    return a.finished.catch(() => {});
  };
  const finishClose = () => { if (!disposed && !closed) { closed = true; clear(); onClosed(); } };
  const settle = () => { if (closing) finishClose(); else { clear(); panel.dataset.motion = 'idle'; } };
  const onMedia = () => { if (media.matches) settle(); };
  const onResize = () => { settle(); if (!closing) { resting = panel.getBoundingClientRect(); restCenter = center(resting); } };
  media.addEventListener('change', onMedia);
  window.addEventListener('resize', onResize);
  if (canAnimate()) {
    const current = ++revision;
    panel.dataset.motion = 'opening';
    try {
      const jobs = [play(mask, [{ opacity: 0 }, { opacity: 1 }], 220, 'linear')];
      if (validRect(origin?.rect)) {
        freezeContent();
        jobs.push(play(panel, [shape(origin.rect, '8px'), shape(resting, radius)], 280, 'cubic-bezier(.2,.75,.25,1)'));
        // The shell may travel from anywhere on screen. Keep the document
        // hidden until that travel finishes; reveal it only at its final place.
        jobs.push(play(content, [{ opacity: 0, offset: 0 }, { opacity: 0, offset: .7 }, { opacity: 1, offset: 1 }], 400, 'linear'));
      } else jobs.push(play(panel, [{ opacity: 0 }, { opacity: 1 }], 140, 'linear'));
      Promise.all(jobs).then(() => { if (!disposed && !closing && current === revision) settle(); });
    } catch { settle(); }
  } else panel.dataset.motion = 'idle';
  return {
    close() {
      if (closing || disposed) return;
      closing = true;
      const from = panel.getBoundingClientRect();
      const opacity = window.getComputedStyle(content).opacity;
      clear();
      panel.dataset.motion = 'closing';
      content.inert = true;
      if (!canAnimate()) { finishClose(); return; }
      // A removed/hidden opener is not a return destination. Do not fly toward
      // stale coordinates after navigation, responsive reflow or unmount.
      const destination = origin?.element?.isConnected ? captureViewerOrigin(origin.element)?.rect : null;
      try {
        const jobs = [play(mask, [{ opacity: 1 }, { opacity: 0 }], 180, 'linear')];
        if (validRect(destination)) {
          freezeContent();
          jobs.push(play(panel, [shape(from, radius), shape(destination, '8px')], 200, 'cubic-bezier(.4,0,.7,.25)'));
          jobs.push(play(content, [{ opacity }, { opacity: 0, offset: .45 }, { opacity: 0 }], 200, 'linear'));
        } else jobs.push(play(panel, [{ opacity: 1 }, { opacity: 0 }], 120, 'linear'));
        Promise.all(jobs).then(finishClose);
      } catch { finishClose(); }
    },
    dispose() { disposed = true; clear(); media.removeEventListener('change', onMedia); window.removeEventListener('resize', onResize); },
  };
}

/** Session destinations come from structured report data, never arbitrary HTML. */
function reportSessionIds(report) {
  return [...new Set((report?.sections?.carryOver || report?.carryOver || []).map((c) => c.sessionId).filter((id) => typeof id === 'string' && id.trim()))];
}

/** Isolated iframe bridge: no same-origin, popup, form or top-navigation powers. */
function reportFrameHtml(html, theme, token, interactive, focus) {
  // 焦点跳转只需要我们自己的 nonce 脚本；会话桥仍然只给带会话的报告。
  const reveal = focus === 'discovery';
  const scriptable = interactive || reveal;
  const policy = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'" + (scriptable ? "; script-src 'nonce-" + token + "'" : '');
  const bridge = interactive ? '<script nonce="' + token + '">document.addEventListener("click",function(e){if(!e.isTrusted)return;var b=e.target.closest("button[data-ddr-session]");if(!b)return;e.preventDefault();parent.postMessage({type:"ddr-open-session",token:"' + token + '",sessionId:b.getAttribute("data-ddr-session")},"*")});</script>' : '';
  // 「详细内容→」从卡片跳进报告时，直接停在每日发现那一段；滚动只发生在 frame 内部。
  const jump = reveal ? '<script nonce="' + token + '">addEventListener("load",function(){requestAnimationFrame(function(){var el=document.querySelector(".discovery");if(el)el.scrollIntoView({block:"start",behavior:"auto"});});});</script>' : '';
  return '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="' + policy + '">' + bridge + jump + '</head><body>' + html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b[^>]*>/gi, '') + '<style>' + theme + '</style></body></html>';
}

/** Validate both the frame identity and the report-specific destination list. */
function bindReportSessionBridge(frame, viewer, token, store) {
  const onMessage = (event) => {
    const data = event.data;
    if (!frame || event.source !== frame.contentWindow || store.get().viewer !== viewer || !data || data.type !== 'ddr-open-session' || data.token !== token || !(viewer.sessionIds || []).includes(data.sessionId)) return;
    store.openSession(data.sessionId);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

function IconClose() {
  return P.IconCloseOutlineRegular ? h(P.IconCloseOutlineRegular, { size: 14 }) : h('span', { 'aria-hidden': true }, '×');
}

/* ---------------------------------------------------------------- hero mark + card */

function HeroFishSvg({ size, className, hovering }) {
  const vb = P.FISH_LOGO_VIEWBOX || { width: 24, height: 18 };
  const d = P.FISH_LOGO_PATH || HERO_REST_PATH;
  return h('svg', {
    className: ['ddr-fish', className].filter(Boolean).join(' '), width: size, height: size * vb.height / vb.width,
    viewBox: '0 0 ' + vb.width + ' ' + vb.height, fill: 'none', 'aria-hidden': 'true',
  }, h('path', { key: hovering ? 'swimming' : 'resting', d, fill: 'currentColor' },
    hovering ? h('animate', {
      attributeName: 'd', values: [d, HERO_SWIM_UP_PATH, d, HERO_SWIM_DOWN_PATH, d].join(';'),
      keyTimes: '0;0.35;0.55;0.75;1', calcMode: 'spline',
      keySplines: '0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1', dur: '1.6s', repeatCount: 'indefinite',
    }) : null));
}

const MorningCardBoundary = React.Component ? class extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('[dsh-daily-report] morning card failed:', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return ReactDOM.createPortal(h('div', { className: 'ddr-root ddr-card-failure', role: 'alert' },
      h('span', null, '简报显示出错，请关闭后重新打开。'),
      h('button', { type: 'button', className: 'ddr-btn', onClick: this.props.onClose }, '关闭提示')), document.body);
  }
} : ({ children }) => children;

function MorningCard({ store, anchorRef, onClose }) {
  const snap = useSyncExternalStore(store.subscribe, store.get);
  const ref = useRef(null);
  const carryRef = useRef(null);
  const tokenCubeRef = useRef(null);
  const place = useCallback(() => {
    const a = anchorRef.current; const c = ref.current;
    if (!a || !c || !a.isConnected || !c.isConnected) return;
    // Position is DOM-only: measuring an animated surface must never enqueue a
    // React render from a layout effect or a ResizeObserver callback.
    const setStyle = (node, key, value) => {
      if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value);
    };
    const carry = carryRef.current;
    const items = carry?.querySelectorAll('li');
    // 卡片只露出前两条待续，其余滚动查看；offset geometry stays in layout pixels while ddr-pop scales the card.
    if (items?.length > 2) {
      const height = items[1].offsetTop + items[1].offsetHeight - items[0].offsetTop;
      if (height > 0) setStyle(carry, 'max-height', height + 'px');
    } else if (carry?.style.maxHeight) carry.style.removeProperty('max-height');
    const r = a.getBoundingClientRect();
    const insetTop = Math.max(16, (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-overlay-top')) || 0) + 12);
    const gap = 12;
    const w = c.offsetWidth;
    const scroll = c.querySelector('.ddr-card-scroll');
    const naturalHeight = c.offsetHeight + (scroll ? Math.max(0, scroll.scrollHeight - scroll.clientHeight) : 0);
    const cx = r.left + r.width / 2;
    let left = Math.round(cx - w / 2);
    left = Math.max(16, Math.min(left, window.innerWidth - w - 16));
    const above = Math.max(0, r.top - gap - insetTop);
    const below = Math.max(0, window.innerHeight - 16 - r.bottom - gap);
    const placement = naturalHeight <= above || above >= below ? 'above' : 'below';
    setStyle(c, 'max-height', Math.max(1, Math.floor(placement === 'above' ? above : below)) + 'px');
    const hgt = c.offsetHeight;
    const desiredTop = placement === 'above' ? r.top - hgt - gap : r.bottom + gap;
    const top = Math.round(Math.max(insetTop, Math.min(desiredTop, window.innerHeight - hgt - 16)));
    const arrow = Math.max(16, Math.min(w - 16, Math.round(cx - left)));
    setStyle(c, 'left', left + 'px');
    setStyle(c, 'top', top + 'px');
    setStyle(c, '--ddr-arrow-x', arrow + 'px');
    if (c.dataset.placement !== placement) c.dataset.placement = placement;
  }, [anchorRef]);
  useLayoutEffect(() => { place(); }, [place, snap.state, snap.busy, snap.error, snap.refreshError]);
  useEffect(() => {
    let frame = null;
    const schedulePlace = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => { frame = null; place(); });
    };
    window.addEventListener('resize', schedulePlace);
    window.addEventListener('scroll', schedulePlace, true);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedulePlace) : null;
    if (ref.current) observer?.observe(ref.current);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    const list = carryRef.current?.querySelector('ul');
    if (list) observer?.observe(list);
    const onKey = (e) => { if (e.key === 'Escape') onClose(false); };
    const onDown = (e) => {
      if (store.get().viewer) return;
      if (ref.current && !ref.current.contains(e.target) && !(anchorRef.current && anchorRef.current.contains(e.target))) onClose(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      observer?.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedulePlace);
      window.removeEventListener('scroll', schedulePlace, true);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [place, onClose, anchorRef]);

  const st = snap.state;
  const card = st && st.card;
  const l1 = card && card.layer1;
  // 天气并入日期行：weather.text 自带「天气 MM-DD · 」前缀，日期由标题行统一给出，直接剥掉。
  // 文案形如「明日 南京 · 🌧 13~18°C 阵雨 · 记得带伞」：先说这是哪天的天气，再给具体数据。
  const wx = (card && l1 && l1.weather) || null;
  const wxBody = wx ? String(wx.text || '').replace(/^天气\s*\d{2}-\d{2}\s*·\s*/, '').trim() : '';
  // 地点：新报告带 location 字段；旧报告没有，就从 text 末尾的「 · 南京」反推（排除温度片段）。
  const wxPlaceRaw = wx ? (wx.location || '') : '';
  const wxTail = wxBody.lastIndexOf(' · ') > 0 ? wxBody.slice(wxBody.lastIndexOf(' · ') + 3).trim() : '';
  const wxPlace = wxPlaceRaw || (wxTail && !/[°℃]/.test(wxTail) && !/\d/.test(wxTail) ? wxTail : '');
  const wxPlaceSep = wxPlace ? wxBody.lastIndexOf(' · ' + wxPlace) : -1;
  const wxDataRaw = wxPlaceSep > 0 ? wxBody.slice(0, wxPlaceSep).trim() : wxBody;
  // 天气日期按报告日说成「今日/明日/昨日」，比重复写 MM-DD 更清楚；相差两天以上才退回具体日期。
  const wxWhen = (() => {
    if (!wx || !wx.date || !card || !card.key) return '';
    const from = Date.parse(String(card.key) + 'T00:00:00');
    const to = Date.parse(String(wx.date) + 'T00:00:00');
    if (!Number.isFinite(from) || !Number.isFinite(to)) return '';
    const diff = Math.round((to - from) / 86400000);
    const word = diff === 0 ? '今日' : diff === 1 ? '明日' : diff === -1 ? '昨日'
      : (+String(wx.date).slice(5, 7)) + '月' + (+String(wx.date).slice(8, 10)) + '日';
    return wxPlace ? word + ' ' + wxPlace : word;
  })();
  const wxData = wxWhen ? wxDataRaw : wxBody;
  const wxInline = wx && (wxWhen || wxData || wx.tip)
    ? h(React.Fragment, null,
      ' · ',
      h('span', { className: 'ddr-wx' },
        wxWhen || null,
        wxWhen && (wxData || wx.tip) ? ' · ' : null,
        wxData || null,
        (wxWhen || wxData) && wx.tip ? ' · ' : null,
        wx.tip ? h('span', { className: 'ddr-tip' }, wx.tip) : null))
    : null;
  // 用量只留 tokens 与涨跌幅，和告警胶囊并排。悬停不再弹详情、也不再抢回 tokens 面：
  // 花费与 bili 口径说明放进 aria-label，鼠标点一下可以提前翻到下一面。
  // layer1.usage 是新报告的结构化字段，旧报告退回 sections.usage.rows（无差值，避免语义错位）。
  const l1Usage = (l1 && l1.usage) || null;
  const usageRows = (card && card.usage && card.usage.rows) || null;
  const tokText = l1Usage ? l1Usage.tokens : usageRows && usageRows[0] ? usageRows[0].value : '';
  const costText = l1Usage ? l1Usage.cost : usageRows && usageRows[1] ? usageRows[1].value : '';
  const tokTrend = l1Usage ? l1Usage.trend : null;
  const tokDelta = l1Usage ? l1Usage.delta : null;
  const bili = l1 && l1.bili;
  const dayNetSaved = bili && bili.netSavedTokens;
  const totalNetSaved = bili && bili.totalNetSavedTokens;
  // bili-c 面板「净节省」显示的是全部会话累计值；当天值只在没有累计值时兜底，
  // 否则弹窗与 bili-c 面板对不上（当天口径还常因账本跨日而为 null）。
  const useBiliTotal = Number.isFinite(totalNetSaved) && totalNetSaved !== 0;
  const biliNet = useBiliTotal ? totalNetSaved : dayNetSaved;
  const showBili = Number.isFinite(biliNet) && (useBiliTotal || biliNet > 0);
  const netApprox = useBiliTotal || (bili && bili.estimated === true) ? '约' : '';
  const biliLabel = useBiliTotal ? (biliNet < 0 ? 'bili-c净增' : 'bili-c净省') : 'bili-c当天净省';
  const biliValue = showBili
    ? (useBiliTotal ? formatBiliPanelTokens(Math.abs(biliNet)) : formatBiliTokens(Math.abs(biliNet))) + ' tokens'
    : '';
  const savingText = showBili ? biliLabel + netApprox + ' ' + biliValue : '';
  const biliBasis = useBiliTotal
    ? '（bili-c 面板「净节省」，理论上界：每次折叠的节省 × 其后每个请求累计）'
    : netApprox ? '（bili 账本净收益估算，已扣除压缩及摘要开销；非账单实测/非窗口回收量）' : '（已扣除压缩及摘要开销）';
  const deltaText = tokTrend && tokDelta ? (tokTrend === 'up' ? '▲' : tokTrend === 'down' ? '▼' : '—') + ' ' + tokDelta : '';
  const usageAria = tokText + ' tokens' + (deltaText ? '，与前一天相比 ' + deltaText : '') + (costText ? '，估算花费约 ' + costText : '');
  const ariaLabel = usageAria + (showBili ? '；' + biliLabel + netApprox + ' ' + biliValue + biliBasis : '');
  const usageContents = [h('b', { key: 'tokens' }, tokText + ' tokens'),
    deltaText ? h('span', { key: 'delta', className: 'ddr-delta ' + tokTrend }, deltaText) : null];
  const usageFace = () => h('span', { className: 'ddr-usage' }, ...usageContents);
  useEffect(() => tokText && showBili ? bindTokenCubeVisibility(tokenCubeRef.current) : undefined, [!!tokText, showBili]);
  // 四面棱柱：tokens / bili 各两张，循环向上翻转；aria-label 一次说清两个数与花费，
  // 四个面都标 aria-hidden，避免转一圈就被读屏重复播报。
  const usageNode = !tokText ? null : showBili
    ? h('span', { className: 'dr-token-cube', ref: tokenCubeRef, role: 'group', 'aria-label': ariaLabel, 'data-paused': snap.viewer || snap.busy ? 'true' : 'false', onClick: advanceTokenCube },
      h('span', { className: 'dr-token-cube__rotor', 'aria-hidden': true },
        h('span', { className: 'dr-token-cube__face dr-token-cube__face--usage' }, usageFace()),
        h('span', { className: 'dr-token-cube__face dr-token-cube__face--bili' }, savingText),
        h('span', { className: 'dr-token-cube__face dr-token-cube__face--usage-back' }, usageFace()),
        h('span', { className: 'dr-token-cube__face dr-token-cube__face--bili-back' }, savingText)))
    : h('span', { className: 'ddr-usage', 'aria-label': ariaLabel }, ...usageContents);
  const alertItems = (l1 && l1.alerts) || [];
  // 每日发现：卡片只显示前 60 字（含省略号），全文留在报告里，由「详细内容→」跳过去。
  const discovery = typeof l1.discovery === 'string' ? l1.discovery.trim() : '';
  const discoveryCut = discovery.length > DISCOVERY_PREVIEW_CHARS ? discovery.slice(0, DISCOVERY_PREVIEW_CHARS - 1) + '…' : discovery;
  const discoveryMore = discovery.length > DISCOVERY_PREVIEW_CHARS
    ? h('button', { type: 'button', className: 'ddr-discovery-more', 'aria-label': '在完整报告里查看每日发现', onClick: (e) => store.view('daily', card.key, 'DSH 每日简报 · ' + card.label, e.currentTarget, 'discovery') }, '详细内容→')
    : null;
  // 多条告警合成一个棱柱，按同一套 3s 台阶轮流露出，宽度只占最宽的那条，
  // 于是告警胶囊和用量能排进同一行。四个面按顺序填，最多展示前四条（超出的告警
  // 本来也需要点开简报才看得全）。静态降级时 is-duplicate 的面会被隐藏。
  const alertNode = alertItems.length > 1
    ? h('span', { className: 'dr-alert-cube', role: 'group', 'aria-label': alertItems.join('；'), onClick: advanceTokenCube },
      h('span', { className: 'dr-alert-cube__rotor', 'aria-hidden': true },
        [0, 1, 2, 3].map((i) => h('span', {
          key: i,
          className: 'dr-alert-cube__face dr-alert-cube__face--' + i + (i >= alertItems.length ? ' is-duplicate' : ''),
        }, '⚠ ' + alertItems[i % alertItems.length]))))
    : alertItems.map((a, i) => h('span', { key: i, className: 'ddr-alert' }, '⚠ ' + a));
  let body;
  if (!st) {
    body = h('p', { className: 'ddr-empty' }, snap.refreshError ? '暂时无法连接简报服务：' + snap.refreshError : '加载中…');
  } else if (!card) {
    body = h(React.Fragment, null,
      h('p', { className: 'ddr-empty' }, st.generating || snap.busy ? '正在扫描会话日志生成简报…' : '还没有简报。生成一份昨天的看看？'),
      h('div', { className: 'ddr-actions' },
        h('button', { type: 'button', className: 'ddr-btn primary', disabled: !!(st.generating || snap.busy), onClick: () => store.generate('daily').catch(() => {}) }, st.generating || snap.busy ? '生成中…' : '生成简报')));
  } else {
    body = h(React.Fragment, null,
      card.fallbackNote ? h('p', { className: 'ddr-note ddr-fallback', role: 'status' }, card.fallbackNote) : null,
      l1.oneLiner ? h('p', { className: 'ddr-one' }, l1.oneLiner) : null,
      alertItems.length || usageNode ? h('div', { className: 'ddr-alerts' },
        alertNode,
        usageNode) : null,
      typeof l1.discovery === 'string' && l1.discovery.trim() && (l1.discoveryLinked !== true || l1.bili)
        ? h('aside', { className: 'ddr-discovery', 'aria-label': '每日发现' }, h('b', null, '每日发现：'), discoveryCut,
          l1.discoveryLinked === true ? h('span', { className: 'ddr-discovery-linked' }, '插件联动') : null,
          discoveryMore) : null,
      (l1.festival || (card.carryOver && card.carryOver.length)) ? h('div', { className: 'ddr-carry' },
        l1.festival
          ? h('h4', { className: 'ddr-fest-row' },
            h('span', { className: 'ddr-fest', style: festStyle(l1.festival), title: '节日彩蛋' }, l1.festival.badge),
            h('span', { className: 'ddr-fest-note' }, l1.festival.greeting))
          : h('h4', null, '明日待续 · ' + card.carryOver.length),
        card.carryOver && card.carryOver.length ? h('div', { ref: carryRef, className: 'ddr-carry-scroll', tabIndex: 0, role: 'region', 'aria-label': '明日待续列表' },
          h('ul', { className: 'ddr-list' }, card.carryOver.map((c, i) => h('li', { key: i }, h('span', null, c.kind === 'todo' ? '待办' : '中断'), h('span', null, c.text, typeof c.sessionId === 'string' && c.sessionId.trim() ? h('button', { type: 'button', className: 'ddr-session-link', title: c.title ? '打开会话：' + c.title : '打开来源会话', onClick: () => store.openSession(c.sessionId) }, '相关会话') : null))))) : null) : null,
      h('div', { className: 'ddr-actions' },
        h('span', { className: 'ddr-meta' }, PRIVACY_LABEL[st.config.privacy] || '',
          card.gen ? h('span', { className: 'ddr-gen', title: '生成本次简报消耗的 token 与费用' }, ' · ' + (card.gen.estimated ? '生成约 ' : '生成 ') + card.gen.tokens + ' tokens（' + card.gen.cny + '）') : null),
        h('button', { type: 'button', className: 'ddr-btn', disabled: !!snap.busy, title: '重新生成', onClick: () => store.generate('daily', { date: card.key }).catch(() => {}) }, snap.busy ? '生成中…' : '刷新'),
        h('button', { type: 'button', className: 'ddr-btn primary', onClick: (e) => store.view('daily', card.key, 'DSH 每日简报 · ' + card.label, e.currentTarget) }, '查看完整报告')));
  }
  return ReactDOM.createPortal(h('section', {
    ref, className: 'ddr-root ddr-card', role: 'dialog', 'aria-label': 'DSH 每日简报', 'data-placement': 'above',
    style: { left: -9999, top: -9999 },
  },
  h('header', { className: 'ddr-head' },
    h('div', { className: 'ddr-title' }, '每日简报', card ? h('small', { className: 'ddr-title-meta' }, card.label, wxInline) : null),
    h('button', { type: 'button', className: 'ddr-x', 'aria-label': '今天不再弹出', title: '今天不再弹出', onClick: () => onClose(true) }, h(IconClose))),
  h('div', { className: 'ddr-card-scroll', tabIndex: 0, role: 'region', 'aria-label': '简报内容' },
    body,
    snap.error || snap.refreshError ? h('p', { className: 'ddr-note ddr-err', role: 'alert' }, snap.error || snap.refreshError) : null)), document.body);
}

function readReportTheme() {
  if (typeof window === 'undefined' || !window.getComputedStyle) return '';
  const style = window.getComputedStyle(document.documentElement);
  const names = ['--dsw-font-family', '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3', '--dsw-alias-bg-module-platform', '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary', '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-border-l3', '--dsw-alias-state-business-primary', '--dsw-alias-brand-primary-new-colorprimary-new-color', '--dsw-radius-panel'];
  const declarations = names.map((name) => {
    const value = style.getPropertyValue(name).trim();
    return value && !/[<>;{}]/.test(value) ? name + ':' + value : '';
  }).filter(Boolean).join(';');
  return ':root{' + declarations + '}';
}

function Viewer({ store }) {
  const snap = useSyncExternalStore(store.subscribe, store.get);
  const v = snap.viewer;
  const panel = useRef(null);
  const mask = useRef(null);
  const content = useRef(null);
  const motion = useRef(null);
  const frame = useRef(null);
  const [bridgeToken] = useState(() => Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join(''));
  useEffect(() => {
    if (!v || !v.sessionIds?.length) return undefined;
    return bindReportSessionBridge(frame.current, v, bridgeToken, store);
  }, [v, bridgeToken, store]);
  const requestClose = useCallback(() => { if (motion.current) motion.current.close(); else store.closeViewer(); }, [store]);
  useLayoutEffect(() => {
    if (!v || !panel.current) return undefined;
    const current = createViewerMotion(panel.current, mask.current, content.current, v.origin, () => store.closeViewer());
    motion.current = current;
    return () => { current.dispose(); if (motion.current === current) motion.current = null; };
  }, [v, store]);
  const [loaded, setLoaded] = useState(null);
  const [frameError, setFrameError] = useState(null);
  const [frameTheme, setFrameTheme] = useState(readReportTheme);
  useLayoutEffect(() => {
    if (!v) return undefined;
    const sync = () => setFrameTheme(readReportTheme());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', sync);
    return () => { observer.disconnect(); media.removeEventListener('change', sync); };
  }, [v]);
  useEffect(() => {
    if (!v) return undefined;
    const previous = v.origin?.element?.isConnected ? v.origin.element : document.activeElement;
    const root = panel.current;
    const siblings = [...document.body.children].filter((el) => !el.contains(root));
    const inertBefore = siblings.map((el) => el.inert);
    siblings.forEach((el) => { el.inert = true; });
    root?.querySelector('[data-viewer-close]')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); requestClose(); }
      if (e.key === 'Tab') {
        const items = [...root.querySelectorAll('button:not(:disabled), iframe')];
        const first = items[0]; const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      siblings.forEach((el, i) => { el.inert = inertBefore[i]; });
      if (previous?.isConnected) previous.focus();
    };
  }, [v, store]);
  if (!v) return null;
  // Only our nonce-authorized click bridge may run; imported scripts stay blocked.
  const interactive = !!v.sessionIds?.length;
  const safeHtml = reportFrameHtml(v.html, frameTheme, bridgeToken, interactive, v.focus);
  const frameKey = String(v.id ?? v.key ?? '') + '\n' + safeHtml;
  return ReactDOM.createPortal(h('div', { key: v.id ?? v.html, className: 'ddr-root ddr-viewer', role: 'dialog', 'aria-modal': true, 'aria-label': v.title },
    h('div', { className: 'ddr-viewer-mask', ref: mask, onClick: requestClose, 'aria-hidden': true }),
    h('div', { className: 'ddr-viewer-panel', ref: panel, tabIndex: -1 },
      h('div', { className: 'ddr-viewer-content', ref: content },
      h('div', { className: 'ddr-viewer-head' },
        h('h3', null, v.title),
        v.key ? h('button', { type: 'button', className: 'ddr-btn', onClick: () => store.open(v.kind, v.key, 'md') }, '打开 Markdown') : null,
        v.key ? h('button', { type: 'button', className: 'ddr-btn', onClick: () => store.open(v.kind, v.key) }, '在浏览器打开') : null,
        h('button', { type: 'button', className: 'ddr-x', 'data-viewer-close': true, 'aria-label': '关闭报告', onClick: requestClose }, h(IconClose))),
      snap.error ? h('p', { className: 'ddr-note ddr-err ddr-viewer-status', role: 'alert' }, snap.error) : null,
      frameError === frameKey ? h('p', { className: 'ddr-note ddr-err ddr-viewer-status', role: 'alert' }, '报告视图载入失败，可关闭后重试，或使用上方按钮打开报告。') : null,
      loaded !== frameKey && frameError !== frameKey ? h('p', { className: 'ddr-note ddr-viewer-status', role: 'status' }, '正在载入报告…') : null,
      h('iframe', { key: frameKey, title: v.title, ref: frame, sandbox: interactive || v.focus === 'discovery' ? 'allow-scripts' : '', referrerPolicy: 'no-referrer', srcDoc: safeHtml, onLoad: () => setLoaded(frameKey), onError: () => setFrameError(frameKey) })))), document.body);
}

/* ---------------------------------------------------------------- settings */

function Switch({ checked, onChange, label, disabled }) {
  if (P.Switch) return h(P.Switch, { checked: !!checked, onChange, label, disabled });
  return h('button', { type: 'button', role: 'switch', 'aria-checked': !!checked, 'aria-label': label, disabled, className: 'ddr-switch', onClick: () => onChange(!checked) });
}

function Seg({ value, options, onChange, label }) {
  return h('div', { className: 'ddr-seg', role: 'radiogroup', 'aria-label': label },
    options.map((o, index) => h('button', {
      key: o.value, type: 'button', role: 'radio', 'aria-checked': o.value === value, tabIndex: o.value === value ? 0 : -1,
      onClick: () => onChange(o.value),
      onKeyDown: (e) => {
        let next;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % options.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = options.length - 1;
        if (next !== undefined) { e.preventDefault(); onChange(options[next].value); e.currentTarget.parentElement.children[next].focus(); }
      },
    }, o.label)));
}

function Row({ title, desc, badge, children, stack }) {
  return h('div', { className: 'ddr-row' + (stack ? ' stack' : '') },
    h('div', { className: 'ddr-row-text' },
      h('div', { className: 'ddr-row-title' }, title, badge ? h('span', { className: 'ddr-badge' + (badge.blue ? ' blue' : '') }, badge.text) : null),
      desc ? h('div', { className: 'ddr-row-desc' }, desc) : null),
    stack ? children : h('div', { className: 'ddr-row-ctl' }, children));
}

function Choice({ checked, title, desc, onSelect, children }) {
  return h('div', null,
    h('button', { type: 'button', role: 'radio', 'aria-checked': checked, className: 'ddr-choice', onClick: onSelect },
      h('span', { className: 'ddr-radio', 'aria-hidden': true }),
      h('span', null, h('b', null, title), h('span', { className: 'd' }, desc))),
    checked && children ? h('div', { className: 'ddr-sub', style: { marginTop: 6 } }, children) : null);
}

function NumberInput({ value, onCommit, min, max, step, width, label }) {
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => { setDraft(String(value ?? '')); }, [value]);
  const commit = () => {
    const n = draft.trim() ? Number(draft) : NaN;
    if (!Number.isFinite(n)) { setDraft(String(value ?? '')); return; }
    const bounded = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    const next = (step ?? 1) === 1 ? Math.round(bounded) : bounded;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return h('input', { 'aria-label': label, className: 'ddr-input num', style: width ? { width } : undefined, type: 'number', min, max, step: step ?? 1, value: draft, onChange: (e) => setDraft(e.target.value), onBlur: commit, onKeyDown: (e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(String(value ?? '')); e.stopPropagation(); } } });
}

function TextInput({ value, onCommit, placeholder, type, width, label }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  return h('input', { 'aria-label': label, className: 'ddr-input', style: width ? { width } : undefined, type: type || 'text', value: draft, placeholder, spellCheck: false, onChange: (e) => setDraft(e.target.value), onBlur: () => { if (draft !== (value || '')) onCommit(draft); }, onKeyDown: (e) => { if (e.key === 'Enter') e.currentTarget.blur(); } });
}

function ReportDirectory({ store, value, actualPath, defaultPath }) {
  const [draft, setDraft] = useState(value || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  useEffect(() => { setDraft(value || ''); }, [value]);
  const save = async (next) => {
    setBusy(true); setMessage(null);
    try {
      await store.patch({ reportsDir: next.trim() });
      setDraft(next.trim()); setMessage({ ok: true, text: '报告目录已保存；新生成的报告将使用此位置。' });
    } catch (e) { setMessage({ ok: false, text: String(e.message || e) }); }
    finally { setBusy(false); }
  };
  return h('div', { className: 'ddr-report-directory' },
    h('label', { className: 'ddr-field' }, h('span', null, '报告保存目录'),
      h('input', { className: 'ddr-input', 'aria-label': '报告保存目录', value: draft, placeholder: defaultPath || '留空使用默认目录', spellCheck: false, disabled: busy,
        onChange: (e) => { setDraft(e.target.value); setMessage(null); },
        onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); save(draft); } },
      })),
    h('p', { className: 'ddr-note' }, '当前：' + (actualPath || defaultPath || '默认目录')),
    h('p', { className: 'ddr-note' }, '填写本机绝对路径，日报 / 周报 / 月报将分别保存在其子目录。仅影响报告归档；事实库、采样和配置仍留在原位置。旧报告不会自动搬移或删除，列表只显示当前目录。若选择云同步或共享文件夹，报告内容可能被同步或共享。'),
    h('div', { className: 'ddr-directory-actions' },
      h('button', { type: 'button', className: 'ddr-btn primary', disabled: busy || draft.trim() === (value || ''), onClick: () => save(draft) }, busy ? '保存中…' : '保存目录'),
      h('button', { type: 'button', className: 'ddr-btn', disabled: busy || !(value || draft), onClick: () => save('') }, '恢复默认目录')),
    message ? h('p', { className: 'ddr-note ' + (message.ok ? 'ddr-ok' : 'ddr-err'), role: message.ok ? 'status' : 'alert' }, message.text) : null);
}

function SettingsSection({ store }) {
  const snap = useSyncExternalStore(store.subscribe, store.get);
  const [models, setModels] = useState(null);
  const [geo, setGeo] = useState(null);
  const [probe, setProbe] = useState(null);
  const [saved, setSaved] = useState(0);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('daily');
  const [pane, setPane] = useState('privacy');
  const [genMsg, setGenMsg] = useState(null);
  useEffect(() => { store.refresh({ withSize: true }); }, []);
  const st = snap.state;
  const cfg = st && st.config;
  const links = (st && st.links) || {};
  useEffect(() => {
    if (cfg && cfg.privacy === 'cloud' && !models) store.call('models').then(setModels).catch(() => setModels({ models: [] }));
  }, [cfg && cfg.privacy]);
  if (!cfg) return h('div', { className: 'ddr-root ddr-set' }, h('p', { className: 'ddr-note' }, snap.refreshError ? '无法读取设置：' + snap.refreshError : '加载中…'));

  const patch = async (p) => {
    setErr(null);
    try { await store.patch(p); setSaved(Date.now()); } catch (e) { setErr(String(e.message || e)); }
  };
  const win = st.platform === 'win32';
  const routeKey = cfg.cloudRoute ? cfg.cloudRoute.provider + '\u0000' + cfg.cloudRoute.model : '';
  const panes = [['privacy', '隐私'], ['health', '健康'], ['report', '报告'], ['cost', '成本']];
  const hints = {
    privacy: '哪些内容参与生成、要不要记录键鼠空闲。默认云端摘要 + 键鼠采样。',
    health: '只做行为提醒，不做医学判断；键鼠采样开关在「隐私」里。',
    report: '什么时候生成、数据从哪来、报告存到哪里。',
    cost: '每日预算与计价口径。',
  };

  const PROJECT_URL = 'https://github.com/Yutai233/dsh-daily-report';
  return h('div', { className: 'ddr-root ddr-set' },
    h('div', { className: 'ddr-set-tabs' },
      h('div', { className: 'ddr-set-tablist', role: 'tablist', 'aria-label': '每日简报设置分类' },
        panes.map(([id, label]) => h('button', {
          key: id, type: 'button', role: 'tab', 'aria-selected': pane === id, className: 'ddr-set-tab' + (pane === id ? ' on' : ''),
          onClick: () => setPane(id),
        }, label))),
      h('div', { className: 'ddr-set-links' },
        h('a', { className: 'ddr-set-link ddr-set-star', href: PROJECT_URL, target: '_blank', rel: 'noopener noreferrer', title: PROJECT_URL }, '点个 Star ⭐'),
        h('a', { className: 'ddr-set-link', href: PROJECT_URL + '/issues', target: '_blank', rel: 'noopener noreferrer', title: PROJECT_URL + '/issues' }, '遇到问题？提issue↗'),
        h('a', { className: 'ddr-set-link ddr-set-version', href: PROJECT_URL, target: '_blank', rel: 'noopener noreferrer', title: 'v' + PLUGIN_VERSION }, 'v' + PLUGIN_VERSION))),
    h('p', { className: 'ddr-note ddr-set-hint' }, hints[pane] || ''),

    // ---------- 1. privacy + sampling
    pane === 'privacy' ? h(React.Fragment, null,
      h('div', { className: 'ddr-group' },
        h('h3', null, '隐私边界'),
        h('p', null, '会话正文是否离开本机。统计数字始终在本机计算，模型只负责写句子。'),
        h('div', { className: 'ddr-choices', role: 'radiogroup', 'aria-label': '隐私边界', style: { padding: '8px 0 12px' } },
          h(Choice, { checked: cfg.privacy === 'cloud', title: 'A · 云端模型摘要（默认）', desc: '把压缩后的「事实包」（你的消息、每轮结论、改动文件）发给所选模型，写 1~2 句「做了什么 + 结果」。效果最好，正文会离开本机；已摘要的会话会缓存，不重复花钱。', onSelect: () => patch({ privacy: 'cloud' }) },
            h('label', { className: 'ddr-field' }, '摘要模型',
              h('select', { className: 'ddr-select', value: routeKey, onChange: (e) => { const v = e.target.value; if (!v) patch({ cloudRoute: null }); else { const [provider, model] = v.split('\u0000'); patch({ cloudRoute: { provider, model } }); } } },
                h('option', { value: '' }, '跟随 DSH 默认模型' + (models && models.defaultRoute ? '（' + models.defaultRoute.model + '）' : '')),
                (models ? models.models : []).map((m) => h('option', { key: m.provider + m.model, value: m.provider + '\u0000' + m.model }, m.label + ' · ' + m.providerLabel)))),
            h('span', { className: 'ddr-note' }, '建议选便宜的快速模型；每天约几分钱到一两毛。')),
          h(Choice, { checked: cfg.privacy === 'local-only', title: 'B · 仅标题 + 统计', desc: '不调用任何模型，正文不出本机；主线由会话标题与改动、交付、失败等事实拼成。', onSelect: () => patch({ privacy: 'local-only' }) }),
          h(Choice, { checked: cfg.privacy === 'local-model', title: 'C · 本地模型摘要', desc: '发给本机的 OpenAI 兼容服务（Ollama、LM Studio、llama.cpp）。正文不出本机，需要自行启动模型；失败时退回 B，不会改用云端。', onSelect: () => patch({ privacy: 'local-model' }) },
            h('label', { className: 'ddr-field' }, '服务地址', h(TextInput, { value: cfg.localModel.baseUrl, placeholder: 'http://127.0.0.1:11434/v1', onCommit: (v) => patch({ localModel: { ...cfg.localModel, baseUrl: v } }) })),
            h('label', { className: 'ddr-field' }, '模型名', h(TextInput, { value: cfg.localModel.model, placeholder: 'qwen2.5:7b', onCommit: (v) => patch({ localModel: { ...cfg.localModel, model: v } }) })),
            h('label', { className: 'ddr-field' }, 'API Key', h(TextInput, { type: 'password', value: cfg.localModel.apiKey, placeholder: '可留空', onCommit: (v) => patch({ localModel: { ...cfg.localModel, apiKey: v } }) })),
            h('div', { className: 'ddr-field' }, h('span', null),
              h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
                h('button', { type: 'button', className: 'ddr-btn', disabled: probe === 'busy', onClick: () => { setProbe('busy'); store.call('probe').then(setProbe).catch((e) => setProbe({ ok: false, error: String(e.message || e) })); } }, probe === 'busy' ? '测试中…' : '测试连接'),
                probe && probe !== 'busy' ? h('span', { className: probe.ok ? 'ddr-note ddr-ok' : 'ddr-note ddr-err' }, probe.ok ? '可用，响应 ' + probe.ms + 'ms' : probe.error) : null))))),
      h('div', { className: 'ddr-group' },
        h('h3', null, '键鼠采样'),
        h(Row, {
          title: '键鼠空闲采样', badge: cfg.inputSampling ? (st.idle.running ? { text: '采样中', blue: true } : { text: '已开启' }) : null,
          desc: win
            ? '每分钟读取一次 Windows「距上次键盘/鼠标输入多久」（GetLastInputInfo），只记录空闲时长，不记录按了什么、不截图、不上传。关闭时健康提醒只用 DSH 消息时间粗略估计，并会注明。'
            : '仅支持 Windows。当前系统下健康提醒只用 DSH 消息时间粗略估计。',
        }, h(Switch, { checked: cfg.inputSampling, disabled: !win, label: '键鼠空闲采样', onChange: (v) => patch({ inputSampling: v }) }))))
      : null,

    // ---------- 2. health
    pane === 'health' ? h('div', { className: 'ddr-group' },
      h(Row, { title: '健康提醒', desc: '久坐、熬夜、午休没离开、周末加班。' }, h(Switch, { checked: cfg.health.enabled, label: '健康提醒', onChange: (v) => patch({ health: { ...cfg.health, enabled: v } }) })),
      cfg.health.enabled ? h(Row, { title: '久坐实时提醒', desc: '在 DSH 里连续用机超过阈值时，直接弹系统通知提醒你起来，不用等到第二天。计时同时看两条线：你的消息时间（15 分钟没有消息就算离开）和键鼠采样（开了「键鼠空闲采样」才算）。哪条线证明你更早就坐下了就用哪条，躲不掉。' },
        h(Switch, { checked: cfg.health.liveReminder, label: '久坐实时提醒', onChange: (v) => patch({ health: { ...cfg.health, liveReminder: v } }) })) : null,
      cfg.health.enabled ? h(Row, { title: '提醒阈值', desc: '连续用机超过多少分钟算久坐；几点以后算熬夜。' },
        h(NumberInput, { label: '久坐提醒分钟数', value: cfg.health.sitLimitMin, min: 20, max: 180, onCommit: (v) => patch({ health: { ...cfg.health, sitLimitMin: v } }) }), h('span', { className: 'ddr-note' }, '分钟'),
        h(NumberInput, { label: '熬夜提醒时刻', value: cfg.health.lateHour, min: 20, max: 26, onCommit: (v) => patch({ health: { ...cfg.health, lateHour: v } }), width: 64 }), h('span', { className: 'ddr-note' }, '点后')) : null)
      : null,

    // ---------- 3. report: delivery + sources + archive
    pane === 'report' ? h(React.Fragment, null,
      h('div', { className: 'ddr-group' },
        h('h3', null, '投递时机'),
        h('p', null, '固定时间会在关机时错过；首次打开不会错过，但看到报告的时间不固定。两者可以并存。'),
        h(Row, { title: '生成方式' },
          h(Seg, { label: '生成方式', value: cfg.delivery, onChange: (v) => patch({ delivery: v }), options: [{ value: 'both', label: '两者并存' }, { value: 'fixed', label: '固定时间' }, { value: 'first-open', label: '首次打开' }] })),
        cfg.delivery !== 'first-open' ? h(Row, { title: '固定时间', desc: '到点生成并落盘' + (cfg.systemNotify ? '，同时发系统通知' : '') + '。' },
          h('input', { className: 'ddr-input time', 'aria-label': '固定生成时间', type: 'time', value: cfg.deliveryTime, onChange: (e) => patch({ deliveryTime: e.target.value }) })) : null,
        h(Row, { title: '报告覆盖哪一天', desc: '自动：18 点前看昨天，18 点后看今天。' },
          h(Seg, { label: '报告日期', value: cfg.reportRange, onChange: (v) => patch({ reportRange: v }), options: [{ value: 'auto', label: '自动' }, { value: 'yesterday', label: '昨天' }, { value: 'today', label: '今天' }] })),
        h(Row, { title: '欢迎页弹出卡片', desc: '新会话页「探索未至之境」的鲸鱼上方弹出当天简报，每天一次；点击鲸鱼可随时再看。' }, h(Switch, { checked: cfg.popup, label: '欢迎页弹出卡片', onChange: (v) => patch({ popup: v }) })),
        cfg.delivery !== 'first-open' ? h(Row, { title: '系统通知', desc: '固定时间生成后弹出 Windows / macOS / Linux 通知。' }, h(Switch, { checked: cfg.systemNotify, label: '系统通知', onChange: (v) => patch({ systemNotify: v }) })) : null,
        h(Row, { title: '周报 / 月报', desc: '每周一生成上周周报，每月 1 日生成上月月报。' },
          h(Switch, { checked: cfg.weekly.enabled, label: '周报', onChange: (v) => patch({ weekly: { ...cfg.weekly, enabled: v } }) }), h('span', { className: 'ddr-note' }, '周报'),
          h(Switch, { checked: cfg.monthly.enabled, label: '月报', onChange: (v) => patch({ monthly: { ...cfg.monthly, enabled: v } }) }), h('span', { className: 'ddr-note' }, '月报'))),
      h('div', { className: 'ddr-group' },
        h('h3', null, '数据来源'),
        h(Row, { title: '天气', desc: cfg.weather.location ? '当前：' + cfg.weather.location + (cfg.weather.latitude !== null ? '（' + cfg.weather.latitude.toFixed(2) + ', ' + cfg.weather.longitude.toFixed(2) + '）' : '') + '。Open-Meteo，免费、无需 Key，只在下雨、降温、空气差时提醒。' : '填写城市后启用。Open-Meteo，免费、无需 Key。' },
          h(Switch, { checked: cfg.weather.enabled, label: '天气', onChange: (v) => patch({ weather: { ...cfg.weather, enabled: v } }) })),
        cfg.weather.enabled ? h('div', { className: 'ddr-row stack' },
          h('div', { style: { display: 'flex', gap: 8 } },
            h(TextInput, { label: '天气城市', value: cfg.weather.location, placeholder: '城市，如 上海', onCommit: (v) => { setGeo(null); if (!v.trim()) { patch({ weather: { ...cfg.weather, location: '', latitude: null, longitude: null } }); return; } store.call('geocode', { name: v }).then((r) => { setGeo(r.results || []); if (r.results && r.results[0]) { const g = r.results[0]; patch({ weather: { ...cfg.weather, location: g.name, latitude: g.latitude, longitude: g.longitude } }); } }).catch((e) => setErr(String(e.message || e))); } })),
          geo && geo.length > 1 ? h('div', { className: 'ddr-reports' }, geo.map((g, i) => h('div', { key: i, className: 'ddr-report' },
            h('span', null, g.name + ' · ' + [g.admin1, g.country].filter(Boolean).join('，')),
            h('button', { type: 'button', className: 'ddr-link', onClick: () => { setGeo(null); patch({ weather: { ...cfg.weather, location: g.name, latitude: g.latitude, longitude: g.longitude } }); } }, '用这个')))) : null,
          geo && geo.length === 0 ? h('span', { className: 'ddr-note ddr-err' }, '没找到这个地点') : null) : null,
        h(Row, { title: 'dsh 启停心跳', desc: '每分钟记一次心跳，下次启动时把最后一次心跳当作关闭时间（崩溃、强关也不丢）。' + (st.host && st.host.startedAt ? '本次启动于 ' + fmtClock(st.host.startedAt) + '。' : '') },
          h(Switch, { checked: cfg.heartbeat, label: 'dsh 启停心跳', onChange: (v) => patch({ heartbeat: v }) })),
        h(Row, { title: '统计子代理会话', desc: '把子代理的 token 与工具调用也计入。' }, h(Switch, { checked: cfg.includeSubagents, label: '统计子代理会话', onChange: (v) => patch({ includeSubagents: v }) }))),
      h('div', { className: 'ddr-group' },
        h('h3', null, '插件联动'),
        h('p', null, '是否允许日报读取下面两个插件提供的运行时数据。关掉任何一项，日报就只用自己的会话记录，不去碰它们；这不影响两个插件本身的工作。'),
        h(Row, {
          title: 'dsh-context（宿主上下文）',
          desc: '读取宿主上下文插件的运行状态与压缩信息；billion-context 的账本也依赖它。',
          badge: { text: cfg.links.context ? (links.context ? '运行中' : '未检测到') : '已关闭', blue: !!(cfg.links.context && links.context) },
        }, h(Switch, { checked: cfg.links.context, label: 'dsh-context 联动', onChange: (v) => patch({ links: { ...cfg.links, context: v } }) })),
        h(Row, {
          title: 'billion-context（bili 账本）',
          desc: '把当天的压缩账本折算成净节省，显示在卡片 token 角标上，并作为「今日发现」里的数值证据。需要 dsh-context 同时运行。' +
            (cfg.links.bili && !links.context ? ' 当前 dsh-context 未运行，暂时不会读取。' : ''),
          badge: { text: cfg.links.bili ? (links.bili ? '运行中' : '未检测到') : '已关闭', blue: !!(cfg.links.bili && links.bili) },
        }, h(Switch, { checked: cfg.links.bili, label: 'billion-context 联动', onChange: (v) => patch({ links: { ...cfg.links, bili: v } }) }))),
      h('div', { className: 'ddr-group' },
        h('h3', null, '报告与存档'),
        h(Row, { title: 'Agent 工具状态', desc: st.toolAvailable === true ? 'daily_report 已注册，可让 agent 查询日报、周报和月报。' : st.toolAvailable === false ? 'daily_report 未注册。当前仍可通过此设置页查看报告；' + (st.toolError || '请检查 Host 工具依赖与日志。') + '' : '当前 Host 未返回工具状态，请更新 Host 后刷新。', badge: { text: st.toolAvailable === true ? '可用' : st.toolAvailable === false ? '不可用' : '未知', blue: st.toolAvailable === true } }),
        h(ReportDirectory, { store, value: cfg.reportsDir, actualPath: st.reportsDir, defaultPath: st.defaultReportsDir }),
        h('p', null, 'Markdown 可直接让 agent 读取回答「上周三我做了什么」。' + (st.dataBytes ? '插件数据及归档共 ' + fmtBytes(st.dataBytes) + '。' : '')),
        h('div', { className: 'ddr-row', style: { borderBottom: 0 } },
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            h('button', { type: 'button', className: 'ddr-btn primary', disabled: !!snap.busy, onClick: (e) => { const origin = captureViewerOrigin(e.currentTarget); setGenMsg(null); store.generate('daily').then((v) => store.showHtml('DSH 每日简报 · ' + v.card.label, v.html, 'daily', v.key, origin, v.sessionIds)).catch((e) => setGenMsg(String(e.message || e))); } }, snap.busy === 'daily' ? '生成中…' : '生成日报'),
            h('button', { type: 'button', className: 'ddr-btn', disabled: !!snap.busy, onClick: (e) => { const origin = captureViewerOrigin(e.currentTarget); setGenMsg(null); store.generate('weekly', { current: true }).then((v) => store.showHtml('DSH 周报 · ' + v.label, v.html, 'weekly', v.key, origin, v.sessionIds)).catch((e) => setGenMsg(String(e.message || e))); } }, snap.busy === 'weekly' ? '生成中…' : '本周周报'),
            h('button', { type: 'button', className: 'ddr-btn', disabled: !!snap.busy, onClick: (e) => { const origin = captureViewerOrigin(e.currentTarget); setGenMsg(null); store.generate('monthly', { current: true }).then((v) => store.showHtml('DSH 月报 · ' + v.label, v.html, 'monthly', v.key, origin, v.sessionIds)).catch((e) => setGenMsg(String(e.message || e))); } }, snap.busy === 'monthly' ? '生成中…' : '本月月报')),
          genMsg ? h('span', { className: 'ddr-note ddr-err' }, genMsg) : null),
        h('div', { className: 'ddr-tabs' }, h(Seg, { label: '报告类型', value: tab, onChange: setTab, options: [{ value: 'daily', label: '日报' }, { value: 'weekly', label: '周报' }, { value: 'monthly', label: '月报' }] })),
        h('div', { className: 'ddr-reports' },
          (st.reports[tab] || []).length ? st.reports[tab].map((k) => h('div', { key: k, className: 'ddr-report' },
            h('span', null, k),
            h('button', { type: 'button', className: 'ddr-link', 'aria-label': '查看报告 ' + k, onClick: (e) => store.view(tab, k, k, e.currentTarget) }, '查看'),
            h('button', { type: 'button', className: 'ddr-link', 'aria-label': '在浏览器打开 ' + k, onClick: () => store.open(tab, k) }, '浏览器打开'))) : h('p', { className: 'ddr-note' }, '暂无')),
        h(Row, { title: '保留天数', desc: '更早的原始采样、事实与日报会被清理。' },
          h(NumberInput, { label: '报告保留天数', value: cfg.retentionDays, min: 7, max: 3650, onCommit: (v) => patch({ retentionDays: v }) }), h('span', { className: 'ddr-note' }, '天'))))
      : null,

    // ---------- 4. cost
    pane === 'cost' ? h('div', { className: 'ddr-group' },
      h(Row, { title: '每日预算', desc: '超出时第 1 层显示提醒；0 表示不设。' },
        h('span', { className: 'ddr-note' }, '¥'), h(NumberInput, { label: '每日预算（元）', value: cfg.budget.dailyCny, min: 0, max: 100000, step: 0.5, onCommit: (v) => patch({ budget: { ...cfg.budget, dailyCny: v } }) })),
      h(Row, { title: '单价（元 / 百万 tokens）', desc: '峰时（工作日 09:00–12:00、14:00–18:00）按下面的价目，其余时段（含周末与法定节假日）按 ' + Math.round(cfg.pricing.offpeakDiscount * 100) + '% 计；默认值取自 DeepSeek 官方价目（Flash），Pro 模型按 3 倍估。', stack: true },
        h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' } },
          [['inputPerM', '输入（未命中）'], ['outputPerM', '输出'], ['cacheReadPerM', '缓存读（命中）']].map(([k, label]) => h('label', { key: k, className: 'ddr-note', style: { display: 'flex', gap: 6, alignItems: 'center' } }, label,
            h(NumberInput, { label: label + '单价', value: cfg.pricing[k], min: 0, max: 1000, step: 0.1, width: 72, onCommit: (v) => patch({ pricing: { ...cfg.pricing, [k]: v } }) }))))))
      : null,

    snap.error || snap.refreshError ? h('p', { className: 'ddr-note ddr-err', role: 'alert' }, snap.error || ('状态刷新失败：' + snap.refreshError)) : null,
    err ? h('p', { className: 'ddr-note ddr-err', role: 'alert' }, err) : null,
    saved ? h('p', { key: saved, className: 'ddr-saved', role: 'status' }, '已保存') : null);
}

/* ---------------------------------------------------------------- plugin */

return {
  inject: ['slots', 'connection'],
  apply(ctx) {
    const slots = ctx.get('slots');
    const connection = ctx.get('connection');
    if (!slots || !connection || !connection.rpc) throw new Error('dsh-daily-report requires Slots and Connection');
    if (!document.querySelector('style[data-plugin-css="dsh-daily-report"]')) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-daily-report';
      tag.dataset.pluginCss = 'dsh-daily-report';
      tag.textContent = CSS_TEXT;
      document.head.appendChild(tag);
      ctx.effect(() => () => tag.remove());
    }
    const store = makeStore(connection, (sessionId) => {
      const workspace = ctx.get('uiWorkspace');
      if (!workspace || typeof workspace.openSession !== 'function') throw new Error('当前 DSH 不支持会话跳转，请更新后再试');
      return workspace.openSession(sessionId);
    });
    store.start();
    ctx.effect(() => () => store.dispose());

    function BrandMark({ size, className }) {
      const snap = useSyncExternalStore(store.subscribe, store.get);
      const [hovering, setHovering] = useState(false);
      const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      useEffect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const stop = () => { setReducedMotion(media.matches); if (media.matches) setHovering(false); };
        stop(); media.addEventListener('change', stop);
        return () => media.removeEventListener('change', stop);
      }, []);
      const anchor = useRef(null);
      const st = snap.state;
      const hasCard = !!(st && st.card);
      const unseen = !!(st && st.showCard);
      return h(React.Fragment, null,
        h('button', {
          ref: anchor, type: 'button', className: 'ddr-fishbtn',
          'aria-label': '每日简报', title: '每日简报', 'aria-expanded': snap.cardOpen,
          onPointerEnter: (e) => { if (e.pointerType !== 'touch' && window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) setHovering(true); },
          onPointerLeave: () => setHovering(false),
          onClick: () => (snap.cardOpen ? store.closeCard(false) : (store.openCard(), store.refresh())),
        },
        h(HeroFishSvg, { size: size || 34, className, hovering: !reducedMotion && (hovering || (unseen && !snap.cardOpen)) }),
        unseen && !snap.cardOpen ? h('span', { className: 'ddr-dot', 'aria-hidden': true }) : null),
        snap.cardOpen ? h(MorningCardBoundary, { onClose: () => store.closeCard(false) },
          h(MorningCard, { store, anchorRef: anchor, onClose: (dismiss) => store.closeCard(dismiss || (hasCard && unseen)) })) : null);
    }

    slots.inject('conversation.hero.brand.mark', () => slots.register({ name: 'conversation.hero.brand.mark' }, BrandMark));
    slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: 'dsh-daily-report-viewer', order: 60 }, () => h(Viewer, { store })));
    slots.inject('settings.section', () => slots.register({ name: 'settings.section', id: 'dsh-daily-report', order: 45, label: '每日简报' }, () => h(SettingsSection, { store })));
    if (P.IconClockOutlineRegular) {
      slots.inject('settings.section.icon', () => slots.register({ name: 'settings.section.icon', id: 'dsh-daily-report' }, ({ size }) => h(P.IconClockOutlineRegular, { size: size || 16 })));
    }
  },
};

 }
});
