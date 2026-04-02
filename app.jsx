const { useState, useMemo } = React;

// ── Gmail notification helpers ────────────────────────────────────
// Maps each stage to the role that owns it — used to find who to notify
var STAGE_NOTIFY_ROLE = {
  "Submitted":                  "Operations",
  "Pending Ops":                "Operations",
  "Pending AML":                "AML",
  "AML Review Pending":         "Requester",
  "Broker Outreach":            "Middle Office",
  "Execution Ready":            "Middle Office",
  "Executing":                  "Trading",
  "Completed - Waiting Transfer":"Middle Office",
  "Returned to Requester":      "Requester",
  "Completed":                  null,
  "Rejected":                   null,
};

function openMailtoDraft(to, subject, body) {
  try {
    var mailto = "mailto:" + encodeURIComponent(to || "") +
      "?subject=" + encodeURIComponent(subject || "") +
      "&body=" + encodeURIComponent(body || "");
    window.location.href = mailto;
    return true;
  } catch (e) {
    return false;
  }
}

// Notify via Gmail API — styled HTML notification email
async function draftNotificationEmail(nextStatus, caseData, permissions, actorName) {
  try {
    var role = STAGE_NOTIFY_ROLE[nextStatus];
    if(!role) return;

    // Recipients: everyone in the target role
    var toList = permissions
      .filter(function(p){ return (p.roles||[p.role]).includes(role); })
      .map(function(p){ return p.email; });

    // Also notify requester on return/complete/reject
    if(caseData.submittedBy && !toList.includes(caseData.submittedBy)) {
      if(["Returned to Requester","AML Review Pending","Completed","Rejected"].includes(nextStatus)) {
        toList.push(caseData.submittedBy);
      }
    }
    if(!toList.length) return;

    var assets = (SEED_ASSETS && SEED_ASSETS[caseData.id]) || caseData.formAssets || [];
    var assetText = assets.map(function(a){ return a.symbol+" — "+a.qty+" units"; }).join(", ") || "See case for details";

    // Status pill colours
    var pillColors = {
      "Submitted":"#7C3AED","Pending Ops":"#EA580C","Pending AML":"#EA580C",
      "AML Review Pending":"#DC2626","Broker Outreach":"#0D9488",
      "Execution Ready":"#16A34A","Executing":"#4338CA",
      "Completed - Waiting Transfer":"#0D9488","Completed":"#374151",
      "Returned to Requester":"#DC2626","Rejected":"#DC2626",
    };
    var pillColor = pillColors[nextStatus] || "#374151";

    var actionMessages = {
      "Submitted":                  "A new ACAT Out request has been submitted and is awaiting your review.",
      "Pending Ops":                "A case has been submitted and requires Operations review and approval.",
      "Pending AML":                "A case has passed Operations review and requires AML approval.",
      "AML Review Pending":         "AML has requested additional information on your transfer request. Please respond via the dashboard.",
      "Broker Outreach":            "AML has approved this case. Please initiate broker outreach to confirm transfer.",
      "Execution Ready":            "Broker has confirmed. Please set the execution date and coordinate with Trading.",
      "Executing":                  "Positions are loaded and MO-approved. Please complete position closure.",
      "Completed - Waiting Transfer":"All positions are closed. Please confirm the transfer to broker to complete the case.",
      "Returned to Requester":      "Your transfer request has been returned with comments. Please review and re-submit.",
      "Completed":                  "Your transfer request has been successfully completed.",
      "Rejected":                   "A transfer request has been rejected. Please review the case notes for details.",
    };

    var subject = "[Transfers Hub] Action required — " + nextStatus + " · " + caseData.clientName + " (" + caseData.id + ")";

    // Get latest note if any
    var latestNote = caseData.notes && caseData.notes.length
      ? caseData.notes[caseData.notes.length-1] : null;

    var clubColor = {"Diamond":"#7C3AED","Platinum Plus":"#2563EB","Platinum":"#3B82F6","Gold":"#F59E0B","Silver":"#94A3B8","Bronze":"#C2410C"};
    var club = caseData.opsClub || caseData.club || "";

    var html = [
      '<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;background:#F8FAFC;margin:0;padding:24px;">',
      '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E2E8F0;box-shadow:0 4px 16px rgba(0,0,0,0.08);">',

      // Header
      '<div style="background:linear-gradient(135deg,#0F172A 0%,#1E1B4B 100%);padding:26px 28px;">',
      '<div style="font-size:10px;font-weight:700;color:#A5B4FC;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Transfers Hub &middot; Automated Notification</div>',
      '<div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;">Action required</div>',
      '<div style="font-size:13px;color:#818CF8;">You have a case pending your review &mdash; '+role+'</div>',
      '</div>',

      // Status banner
      '<div style="padding:14px 28px;background:#FFFBEB;border-bottom:1px solid #FDE68A;display:flex;align-items:center;gap:10px;">',
      '<span style="background:'+pillColor+';color:#fff;font-size:11px;font-weight:700;border-radius:99px;padding:4px 14px;white-space:nowrap;">&bull; '+nextStatus+'</span>',
      '<span style="font-size:12px;color:#374151;font-weight:600;">'+( actionMessages[nextStatus]||"Case updated.")+'</span>',
      '</div>',

      // Case details table
      '<div style="padding:22px 28px;">',
      '<div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Case details</div>',
      '<table style="width:100%;border-collapse:collapse;">',
      '<tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:8px 0;font-size:12px;color:#9CA3AF;width:130px;">Case ID</td><td style="padding:8px 0;font-size:12px;font-weight:700;color:#111827;font-family:monospace;">'+caseData.id+'</td></tr>',
      '<tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:8px 0;font-size:12px;color:#9CA3AF;">Ticket</td><td style="padding:8px 0;font-size:12px;font-weight:600;color:#6B7280;font-family:monospace;">'+(caseData.ticketRef||"—")+'</td></tr>',
      '<tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:8px 0;font-size:12px;color:#9CA3AF;">Client</td><td style="padding:8px 0;font-size:13px;font-weight:800;color:#111827;">'+caseData.clientName+'</td></tr>',
      '<tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:8px 0;font-size:12px;color:#9CA3AF;">CID</td><td style="padding:8px 0;font-size:12px;font-weight:700;color:#4338CA;font-family:monospace;">'+caseData.cid+'</td></tr>',
      '<tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:8px 0;font-size:12px;color:#9CA3AF;">Broker</td><td style="padding:8px 0;font-size:12px;font-weight:600;color:#111827;">'+(caseData.broker||"—")+'</td></tr>',
      '<tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:8px 0;font-size:12px;color:#9CA3AF;">Value</td><td style="padding:8px 0;font-size:14px;font-weight:800;color:#0EA5E9;">$'+Number(caseData.valueUSD).toLocaleString()+'</td></tr>',
      '<tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:8px 0;font-size:12px;color:#9CA3AF;">Assets</td><td style="padding:8px 0;font-size:12px;font-weight:600;color:#374151;">'+assetText+'</td></tr>',
      club ? '<tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:8px 0;font-size:12px;color:#9CA3AF;">Club</td><td style="padding:8px 0;"><span style="font-size:11px;font-weight:700;color:'+(clubColor[club]||"#6B7280")+';">'+club+'</span></td></tr>' : '',
      '<tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:8px 0;font-size:12px;color:#9CA3AF;">Reference</td><td style="padding:8px 0;font-size:12px;font-weight:700;color:#5B21B6;font-family:monospace;">'+(caseData.opsReference||"—")+'</td></tr>',
      '<tr><td style="padding:8px 0;font-size:12px;color:#9CA3AF;">Updated by</td><td style="padding:8px 0;font-size:12px;font-weight:600;color:#374151;">'+(actorName||"System")+'</td></tr>',
      '</table>',
      '</div>',

      // Latest note (if any)
      latestNote ? [
        '<div style="margin:0 28px 20px;background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:12px 14px;">',
        '<div style="font-size:10px;font-weight:700;color:#6B7280;margin-bottom:5px;">LATEST NOTE &middot; '+latestNote.byName+' &middot; '+latestNote.date+'</div>',
        '<div style="font-size:12px;color:#166534;line-height:1.5;">'+latestNote.text+'</div>',
        '</div>',
      ].join("") : "",

      // CTA
      '<div style="padding:0 28px 28px;">',
      '<div style="background:'+pillColor+';border-radius:10px;padding:16px;text-align:center;">',
      '<div style="font-size:14px;font-weight:800;color:#fff;">Log in to Transfers Hub to take action</div>',
      '<div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:4px;">Go to My Queue &rarr; '+caseData.id+'</div>',
      '</div>',
      '</div>',

      // Footer
      '<div style="padding:14px 28px;background:#F8FAFC;border-top:1px solid #E5E7EB;">',
      '<div style="font-size:10px;color:#9CA3AF;text-align:center;">Automated notification from Transfers Hub &middot; eToro &middot; Do not reply to this email</div>',
      '</div>',

      '</div></body></html>',
    ].join("");

    // Call the API to create the Gmail draft
    var response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content:
          "Use the Gmail MCP tool gmail_create_draft to create an HTML email draft with:\n" +
          "to: " + toList.join(", ") + "\n" +
          "subject: " + subject + "\n" +
          "contentType: text/html\n" +
          "body: " + html + "\n\n" +
          "Reply with only: DRAFT_CREATED or DRAFT_FAILED"
        }],
        mcp_servers: [{ type: "url", url: "https://gmail.mcp.claude.com/mcp", name: "gmail-mcp" }]
      })
    });
  } catch(e) {
    console.warn("Notification email failed:", e);
  }
}

// Draft a broker outreach email and return draft status
async function draftBrokerEmail(to, subject, body) {
  try {
    var response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content:
          "Use the Gmail MCP tool gmail_create_draft to create a draft email:\n" +
          "to: " + to + "\n" +
          "subject: " + subject + "\n" +
          "body: " + body + "\n" +
          "Reply with just: DRAFT_CREATED or DRAFT_FAILED"
        }],
        mcp_servers: [{ type: "url", url: "https://gmail.mcp.claude.com/mcp", name: "gmail-mcp" }]
      })
    });
    var data = await response.json();
    var text = (data.content||[]).map(function(b){return b.text||"";}).join("");
    return text.includes("DRAFT_CREATED") ? "success" : "failed";
  } catch(e) {
    return "failed";
  }
}

var DEFAULT_PERMISSIONS = [
  {email:"omar.p@etoro.com",   name:"Omar P.",  roles:["Operations"],    pin:"1001", extraTabs:[]},
  {email:"nina.s@etoro.com",   name:"Nina S.",  roles:["Operations"],    pin:"1002", extraTabs:[]},
  {email:"layla.m@etoro.com",  name:"Layla M.", roles:["AML"],           pin:"2001", extraTabs:[]},
  {email:"chris.b@etoro.com",  name:"Chris B.", roles:["Middle Office"], pin:"3001", extraTabs:[]},
  {email:"dana.t@etoro.com",   name:"Dana T.",  roles:["Middle Office"], pin:"3002", extraTabs:[]},
  {email:"james.h@etoro.com",  name:"James H.", roles:["Trading"],       pin:"4001", extraTabs:[]},
  {email:"madonama@etoro.com", name:"Admin",    roles:["Admin"],         pin:"0000", extraTabs:[]},
];

var ROLES = ["Operations","AML","Middle Office","Trading","Admin"];
var ROLE_COLOR = {Requester:"#0D9488",Operations:"#7C3AED",AML:"#EA580C","Middle Office":"#2563EB",Trading:"#4338CA",Admin:"#374151"};
var ROLE_DESC = {Requester:"Submit and track own requests",Operations:"Case review and Ops approval",AML:"AML review and approval","Middle Office":"Broker coordination and execution",Trading:"Position closure data entry",Admin:"Manage all user permissions"};

var STAGES = ["Submitted","Pending Ops","Pending AML","Broker Outreach","Execution Ready","Executing","Completed - Waiting Transfer","Completed","Rejected","Returned to Requester","AML Review Pending"];
var STAGE_ROLE = {
  "Submitted":                   "Operations",
  "Pending Ops":                 "Operations",
  "Pending AML":                 "AML",
  "Broker Outreach":             "Middle Office",
  "Execution Ready":             "Middle Office",
  "Completed - Waiting Transfer":"Middle Office",
  "Returned to Requester":       "Requester",
  "AML Review Pending":          "Requester"
};
var NEXT_ACTION = {
  "Submitted":              {label:"Approve & send to AML",          next:"Pending AML"},
  "Pending Ops":            {label:"Ops approve",                     next:"Pending AML"},
  "Pending AML":            {label:"AML approve",                     next:"Broker Outreach"},
  "Broker Outreach":        {label:"Broker confirmed",                next:"Execution Ready"},
  "Completed - Waiting Transfer":{label:"Confirm transfer to broker", next:"Completed"},
  "Returned to Requester":  {label:"Re-submit to Operations",         next:"Submitted"},
  "AML Review Pending":     {label:"Re-submit to AML",                next:"Pending AML"},
};

var STATUS_COLOR = {
  "Submitted":                   "#DBEAFE|#1E40AF",
  "Pending Ops":                 "#FEF3C7|#92400E",
  "Pending AML":                 "#FFEDD5|#9A3412",
  "Broker Outreach":             "#CCFBF1|#134E4A",
  "Execution Ready":             "#DCFCE7|#166534",
  "Executing":                   "#E0E7FF|#3730A3",
  "Completed - Waiting Transfer":"#FEF3C7|#92400E",
  "Completed":                   "#F3F4F6|#374151",
  "Rejected":                    "#FEE2E2|#991B1B",
  "Returned to Requester":       "#FEE2E2|#991B1B",
  "AML Review Pending":          "#FEE2E2|#9A3412"
};

function bs(s) {
  var p = (STATUS_COLOR[s]||"#F3F4F6|#374151").split("|");
  return {background:p[0],color:p[1],padding:"2px 10px",borderRadius:99,fontSize:11,fontWeight:600,whiteSpace:"nowrap",display:"inline-block"};
}

var SEED_ASSETS = {
  "ACAT-2025-041":[{symbol:"META",name:"Meta Platforms Inc",qty:"120",exchange:"NASDAQ"}],
  "ACAT-2025-042":[{symbol:"TSLA",name:"Tesla Motors Inc",qty:"45",exchange:"NASDAQ"}],
  "ACAT-2025-043":[{symbol:"AAPL",name:"Apple Inc",qty:"300",exchange:"NASDAQ"}],
  "ACAT-2025-044":[{symbol:"AMZN",name:"Amazon.com Inc",qty:"18",exchange:"NASDAQ"},{symbol:"GOOG",name:"Alphabet Inc",qty:"5",exchange:"NASDAQ"}],
  "ACAT-2025-045":[{symbol:"NVDA",name:"Nvidia Corp",qty:"80",exchange:"NASDAQ"}],
  "ACAT-2025-046":[{symbol:"MSFT",name:"Microsoft Corp",qty:"65",exchange:"NASDAQ"}],
};

// ── Global ACATSOUT reference counter ──────────────────────────
// Starts at 500, increments per new case. Each asset on the case
// gets its own ref: base ref for asset 1, base+1 for asset 2, etc.
var _refCounter = { next: 500 };
function nextRef() { return _refCounter.next++; }

function mkCase(id,cid,nm,co,br,instr,val,status,byEmail,byName,date,club,extra) {
  // Generate one unique base reference per case (ACATSOUT500, 501, ...)
  var baseRef = nextRef();
  var base = {
    id:id,cid:cid,clientName:nm,country:co,broker:br,brokerEmail:"",
    requesterAccountNumber:"",requesterAccountName:"",transferType:"NCBO",
    instruments:instr,valueUSD:val,
    reason:"Portfolio consolidation",status:status,submittedBy:byEmail,submittedByName:byName,
    submittedDate:date,club:club,direction:"Out",fees:instr*100,
    // Checklist — null=not reviewed, true=pass, false=fail
    accountNormal:null,cashOk:null,formComplete:null,fullStockOut:null,
    proofOwnership:null,nwaZero:null,lockedZero:null,w8Ok:null,
    // Extra checklist data fields
    clientBalance:"",      // entered by Ops for cashOk check
    lockedAmount:"",       // entered by Ops — 0 means lockedZero passes
    ticketRef:"SR-"+(10040+parseInt(id.slice(-3))),
    // Auto-generated reference — unique per case, per asset offset by index
    opsReference:"ACATSOUT"+baseRef,
    compensationNote:"ACATSOUT"+baseRef,   // kept in sync with opsReference
    executionDate:"",tradingAmount:"",tradingClosedBy:"",asset:"",
    execRows:[],notes:[],documents:[],
    opsClub:"",opsSanctionStock:false,opsFCMU:"Pending",opsCustomFields:[],
    // Broker communication tracking
    brokerDraftedAt:"",brokerEmailSentAt:"",brokerRepliedAt:"",brokerEmailTo:"",
    moMOID:"",moInstrumentID:"",moISIN:"",moCUSIP:"",moHedgeServer:"",
    moLiquidityAccount:"",moLP_Main:"",moLP_Sub:"",moInternalTransferDate:"",
    moDateClosure:"",moValueClosure:"",moCustomFields:[]
  };
  if(extra){Object.keys(extra).forEach(function(k){base[k]=extra[k];});}
  return base;
}

var SEED = [
  mkCase("ACAT-2025-041","45061","James Harrington","US","Fidelity",1,45061.93,"Pending Ops","sara.k@etoro.com","Sara K.","2025-06-01","Diamond",{
    accountNormal:true,cashOk:true,formComplete:true,fullStockOut:true,proofOwnership:true,nwaZero:true,lockedZero:true,w8Ok:true,
    notes:[{role:"Operations",byName:"Omar P.",text:"W8 confirmed",date:"2025-06-02"}]
  }),
  mkCase("ACAT-2025-042","33812","Leila Osman","AE","Saxo Bank",1,12400,"Submitted","tom.w@etoro.com","Tom W.","2025-06-03","Platinum Plus",{
    notes:[{role:"Operations",byName:"Omar P.",text:"Awaiting checklist review",date:"2025-06-04"}]
  }),
  mkCase("ACAT-2025-043","67234","David Muller","DE","Interactive Brokers",1,98300,"Execution Ready","sara.k@etoro.com","Sara K.","2025-05-28","Standard",{
    accountNormal:true,cashOk:true,formComplete:true,fullStockOut:true,proofOwnership:true,nwaZero:true,lockedZero:true,w8Ok:true,
    executionDate:"2025-06-05",notes:[{role:"Middle Office",byName:"Chris B.",text:"IB confirmed Thursday",date:"2025-06-02"}]
  }),
  mkCase("ACAT-2025-044","21905","Priya Mehta","IN","Zerodha",2,5800,"Submitted","alex.r@etoro.com","Alex R.","2025-06-04","Standard",{
    cashOk:false,proofOwnership:false,w8Ok:false
  }),
  mkCase("ACAT-2025-045","88231","Carlos Reyes","MX","GBM",1,31000,"Submitted","tom.w@etoro.com","Tom W.","2025-06-02","Standard",null),
  mkCase("ACAT-2025-046","55129","Yuki Tanaka","JP","Nomura",1,19500,"Pending AML","sara.k@etoro.com","Sara K.","2025-05-30","Platinum Plus",{
    accountNormal:true,cashOk:true,formComplete:true,fullStockOut:true,proofOwnership:true,nwaZero:true,lockedZero:true,w8Ok:true,
    notes:[{role:"AML",byName:"Layla M.",text:"Enhanced screening in progress",date:"2025-06-01"}]
  }),
];

var ROLE_QUEUE_STAGES = {
  Requester:       ["Returned to Requester","AML Review Pending"],
  Operations:      ["Submitted","Pending Ops"],
  AML:             ["Pending AML"],
  "Middle Office": ["Broker Outreach","Execution Ready","Completed - Waiting Transfer"],
  Trading:         ["Executing"],
};
var ROLE_VISIBLE_STAGES = {
  Requester:       STAGES,
  Operations:      STAGES,
  AML:             ["Pending AML","AML Review Pending","Execution Ready","Completed","Rejected"],
  "Middle Office": STAGES,
  Trading:         ["Execution Ready","Executing","Completed - Waiting Transfer","Completed"],
  Admin:           STAGES,
};

var TAB_MAP = {
  Requester:["🏠 Home","My Requests","My Queue","New Request"],
  Operations:["🏠 Home","My Queue","All Cases","Raw Data","New Request","Execution"],
  AML:["🏠 Home","My Queue","All Cases","Raw Data"],
  "Middle Office":["🏠 Home","My Queue","All Cases","Raw Data","New Request","Execution"],
  Trading:["🏠 Home","Raw Data","Execution"],
  Admin:["🏠 Home","My Queue","All Cases","Raw Data","New Request","Execution","Reports","Permissions"]
};

// All tabs across all roles for the extraTabs picker
var ALL_TABS=[];
Object.keys(TAB_MAP).forEach(function(r){TAB_MAP[r].forEach(function(t){if(!ALL_TABS.includes(t))ALL_TABS.push(t);});});

// ── Multi-role resolution ─────────────────────────────────────────
// Merges roles[], extraTabs[] into a single resolved access object.
function resolveUserAccess(perm) {
  var roles=perm.roles||(perm.role?[perm.role]:["Requester"]);
  var priority=["Admin","Middle Office","Operations","AML","Trading","Requester"];
  var primary="Requester";
  for(var i=0;i<priority.length;i++){if(roles.includes(priority[i])){primary=priority[i];break;}}
  // Merge tabs
  var seen={};var tabs=[];
  roles.forEach(function(r){(TAB_MAP[r]||[]).forEach(function(t){if(!seen[t]){seen[t]=true;tabs.push(t);}});});
  (perm.extraTabs||[]).forEach(function(t){if(!seen[t]){seen[t]=true;tabs.push(t);}});
  // Merge queue stages
  var qStages=[];
  roles.forEach(function(r){(ROLE_QUEUE_STAGES[r]||[]).forEach(function(s){if(!qStages.includes(s))qStages.push(s);});});
  // Merge visible stages (if any role gets STAGES, result is STAGES)
  var useAll=false;var vStages=[];
  roles.forEach(function(r){
    var rs=ROLE_VISIBLE_STAGES[r];
    if(!rs||rs.length===STAGES.length)useAll=true;
    else rs.forEach(function(s){if(!vStages.includes(s))vStages.push(s);});
  });
  return {primary:primary,roles:roles,tabs:tabs,queueStages:qStages,visibleStages:useAll?STAGES:vStages};
}

var RAW_FIELDS = {
  Operations:[
    "id","cid","clientName","country","opsClub","submittedDate","submittedByName","status","rejectionReason",
    "ticketRef","opsReference","opsSanctionStock","opsFCMU","fees",
    "accountNormal","cashOk","clientBalance","formComplete","fullStockOut",
    "proofOwnership","nwaZero","lockedZero","lockedAmount","w8Ok",
    "transferType","broker","brokerEmail","requesterAccountName","requesterAccountNumber","executionDate"
  ],
  AML:[
    "id","cid","clientName","country","opsClub","broker","valueUSD","submittedDate","status","rejectionReason",
    "w8Ok","opsSanctionStock","proofOwnership","transferType","ticketRef","submittedByName","reason"
  ],
  "Middle Office":[
    "id","cid","clientName","country","opsClub","broker","brokerEmail","requesterAccountName","requesterAccountNumber",
    "instruments","valueUSD","transferType","status","executionDate",
    "brokerDraftedAt","brokerEmailSentAt","brokerRepliedAt",
    "moMOID","moCUSIP","moHedgeServer",
    "moLiquidityAccount","moLP_Main","moLP_Sub","moInternalTransferDate","moDateClosure","moValueClosure",
    "tradingAmount","opsReference","submittedByName"
  ],
  Trading:[
    "id","cid","clientName","instruments","valueUSD","status","executionDate",
    "tradingAmount","tradingClosedBy","opsReference"
  ],
  Admin:[
    "id","cid","clientName","country","opsClub","direction","broker","brokerEmail",
    "requesterAccountName","requesterAccountNumber","transferType",
    "instruments","valueUSD","fees","status","rejectionReason","submittedDate","submittedByName",
    "ticketRef","opsReference","accountNormal","cashOk","clientBalance","formComplete","fullStockOut",
    "proofOwnership","nwaZero","lockedZero","lockedAmount","w8Ok",
    "opsSanctionStock","opsFCMU","executionDate","tradingAmount"
  ]
};

var FL = {
  id:"Case ID",cid:"CID",clientName:"Client",country:"Country",direction:"Dir",
  broker:"Broker",brokerEmail:"Broker email",
  requesterAccountName:"Acct name",requesterAccountNumber:"Acct number",
  transferType:"Type",instruments:"Instr",valueUSD:"Value USD",
  opsClub:"Club",club:"Club (submitted)",status:"Status",
  submittedDate:"Submitted",submittedByName:"By",fees:"Fees",
  opsSanctionStock:"Sanction",opsFCMU:"FCMU",
  opsReference:"Reference",clientBalance:"Client balance",lockedAmount:"Locked amt",
  accountNormal:"Acct OK",cashOk:"Cash OK",formComplete:"Form OK",
  fullStockOut:"Full stock out",proofOwnership:"Proof",
  nwaZero:"NWA=0",lockedZero:"Locked=0",w8Ok:"W8",
  ticketRef:"Ticket",executionDate:"Exec date",tradingAmount:"Trading $",
  tradingClosedBy:"Closed by",compensationNote:"Comp ref",
  rejectionReason:"Rejection reason",reason:"Transfer reason",
  brokerDraftedAt:"Broker draft at",brokerEmailSentAt:"Broker sent at",brokerRepliedAt:"Broker replied at",moInstrumentID:"Instr ID",moISIN:"ISIN",moCUSIP:"CUSIP",
  moHedgeServer:"Hedge svr",moLiquidityAccount:"Liq acct",
  moLP_Main:"LP Main",moLP_Sub:"LP Sub",moInternalTransferDate:"Int xfer",
  moDateClosure:"Closure dt",moValueClosure:"Closure val"
};

// Helper: extract rejection reason from notes array
function getRejectionReason(c){
  if(!c.notes||!c.notes.length)return"";
  var n=c.notes.slice().reverse().find(function(n){
    return n.text.startsWith("Rejected:")||n.text.startsWith("Returned to requester:")||n.text.startsWith("AML review pending:");
  });
  return n?n.text:"";
}

function RawDataTab(props) {
  var cases=props.cases; var user=props.user;
  var options=user.role==="Admin"?["Admin","Operations","AML","Middle Office","Trading"]:[user.role];
  var [view,setView]=useState(options[0]);
  var [search,setSearch]=useState("");
  var [statusFilter,setStatusFilter]=useState("All");
  var [copied,setCopied]=useState(false);

  var fields=RAW_FIELDS[view]||RAW_FIELDS.Admin;

  // Enrich case with computed field
  function enrichCase(c){
    var n=cloneObj(c);
    n.rejectionReason=getRejectionReason(c);
    return n;
  }

  var visibleStages=ROLE_VISIBLE_STAGES[view]||STAGES;
  var allStatuses=["All"].concat(visibleStages);

  var filtered=cases.map(enrichCase).filter(function(c){
    var matchStage=visibleStages.includes(c.status);
    var matchStatus=statusFilter==="All"||c.status===statusFilter;
    var q=search.toLowerCase();
    var matchSearch=!q||
      (c.clientName||"").toLowerCase().includes(q)||
      (c.cid||"").includes(q)||
      (c.id||"").toLowerCase().includes(q)||
      (c.broker||"").toLowerCase().includes(q)||
      (c.opsReference||"").toLowerCase().includes(q);
    return matchStage&&matchStatus&&matchSearch;
  });

  function cellValue(c,f){
    if(f==="opsClub")return c.opsClub||c.club||"";
    return c[f];
  }

  function exportCSV(){
    var header=fields.map(function(f){return'"'+(FL[f]||f)+'"';}).join(",");
    var rows=filtered.map(function(c){
      return fields.map(function(f){
        var v=cellValue(c,f);
        if(v===true)return"Yes";
        if(v===false)return"No";
        if(v===null||v===undefined)return"";
        return'"'+String(v).replace(/"/g,'""')+'"';
      }).join(",");
    });
    var csv=header+"\n"+rows.join("\n");
    var blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    var url=URL.createObjectURL(blob);
    var a=document.createElement("a");
    a.href=url;
    a.download="ACAT_Out_"+view.replace(/\s/g,"_")+"_"+new Date().toISOString().slice(0,10)+".csv";
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function copyTSV(){
    var header=fields.map(function(f){return FL[f]||f;}).join("\t");
    var rows=filtered.map(function(c){
      return fields.map(function(f){
        var v=cellValue(c,f);
        if(v===true)return"Yes";
        if(v===false)return"No";
        if(v===null||v===undefined)return"";
        return String(v);
      }).join("\t");
    });
    var tsv=header+"\n"+rows.join("\n");
    navigator.clipboard&&navigator.clipboard.writeText(tsv);
    setCopied(true);setTimeout(function(){setCopied(false);},2000);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>

      {/* Role view switcher */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:11,fontWeight:600,color:"#374151"}}>View as:</span>
        {options.map(function(v){
          var color=ROLE_COLOR[v]||"#374151";
          return (
            <button key={v} onClick={function(){setView(v);setStatusFilter("All");setSearch("");}}
              style={{fontSize:11,fontWeight:600,border:"2px solid "+(view===v?color:"#E5E7EB"),borderRadius:99,padding:"3px 12px",cursor:"pointer",background:view===v?color+"12":"#fff",color:view===v?color:"#6B7280"}}>
              {v}
            </button>
          );
        })}
      </div>

      {/* Search + filter + export row */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <input
          style={{fontSize:12,border:"1px solid #E5E7EB",borderRadius:8,padding:"6px 10px",width:200}}
          placeholder="Search CID, client, broker, ref..."
          value={search}
          onChange={function(e){setSearch(e.target.value);}}
        />
        <select
          style={{fontSize:12,border:"1px solid #E5E7EB",borderRadius:8,padding:"6px 9px",background:"#fff"}}
          value={statusFilter}
          onChange={function(e){setStatusFilter(e.target.value);}}>
          {allStatuses.map(function(s){return <option key={s}>{s}</option>;})}
        </select>
        <div style={{fontSize:11,color:"#9CA3AF",marginLeft:4}}>{filtered.length} of {cases.length} cases · {fields.length} columns</div>
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button onClick={copyTSV}
            style={{fontSize:11,fontWeight:600,border:"1px solid #C7D2FE",borderRadius:7,padding:"5px 12px",cursor:"pointer",background:copied?"#DCFCE7":"#EEF2FF",color:copied?"#166534":"#4338CA"}}>
            {copied?"✓ Copied!":"📋 Copy (TSV)"}
          </button>
          <button onClick={exportCSV}
            style={{fontSize:11,fontWeight:600,border:"1px solid #86EFAC",borderRadius:7,padding:"5px 12px",cursor:"pointer",background:"#F0FDF4",color:"#166534"}}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{overflowX:"auto",border:"1px solid #E5E7EB",borderRadius:12,maxHeight:560,overflowY:"auto"}}>
        <table style={{borderCollapse:"collapse",fontSize:11,width:"max-content",minWidth:"100%"}}>
          <thead>
            <tr style={{background:"#F9FAFB",position:"sticky",top:0,zIndex:1}}>
              {fields.map(function(f){
                return (
                  <th key={f} style={{padding:"7px 12px",textAlign:"left",fontWeight:700,color:"#374151",whiteSpace:"nowrap",borderBottom:"2px solid #E5E7EB",minWidth:80,fontSize:11}}>
                    {FL[f]||f}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0&&(
              <tr><td colSpan={fields.length} style={{padding:"32px",textAlign:"center",color:"#9CA3AF"}}>No cases match your search</td></tr>
            )}
            {filtered.map(function(c,ri){
              var isRejected=c.status==="Rejected"||c.status==="Returned to Requester"||c.status==="AML Review Pending";
              return (
                <tr key={c.id} style={{background:isRejected?"#FEF9F9":ri%2===0?"#fff":"#F9FAFB",borderBottom:"1px solid #F3F4F6"}}>
                  {fields.map(function(f){
                    var v=cellValue(c,f);
                    var isStatus=f==="status";
                    var isRef=f==="opsReference";
                    var isBool=v===true||v===false;
                    var isNull=v===null||v===undefined||v==="";
                    var isRejectReason=f==="rejectionReason";
                    return (
                      <td key={f} style={{padding:"6px 12px",whiteSpace:isRejectReason?"normal":"nowrap",maxWidth:isRejectReason?220:"none",verticalAlign:"top"}}>
                        {isStatus
                          ?<span style={bs(v)}>{v}</span>
                          :isBool
                            ?<span style={{fontSize:12,fontWeight:700,color:v?"#16A34A":"#EF4444"}}>{v?"✓":"✗"}</span>
                            :isRef&&v
                              ?<span style={{fontFamily:"monospace",fontSize:10,fontWeight:700,color:"#5B21B6",background:"#EDE9FE",borderRadius:4,padding:"1px 5px"}}>{v}</span>
                              :isNull
                                ?<span style={{color:"#D1D5DB",fontSize:11}}>—</span>
                                :isRejectReason&&v
                                  ?<span style={{fontSize:10,color:"#991B1B",lineHeight:1.4,display:"block"}}>{v}</span>
                                  :<span style={{color:"#374151"}}>{v}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cloneObj(x){var n={};Object.keys(x).forEach(function(k){n[k]=x[k];});return n;}
function updateCase(cases,id,field,val){return cases.map(function(x){if(x.id!==id)return x;var n=cloneObj(x);n[field]=val;return n;});}
function patchCase(cases,id,patch){return cases.map(function(x){if(x.id!==id)return x;var n=cloneObj(x);Object.keys(patch).forEach(function(k){n[k]=patch[k];});return n;});}

function Avatar(props) {
  var name=props.name; var role=props.role; var size=props.size||32;
  var initials=(name||"?").split(" ").map(function(w){return w[0];}).join("").toUpperCase().slice(0,2);
  return <div style={{width:size,height:size,borderRadius:"50%",background:ROLE_COLOR[role]||"#374151",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.35,fontWeight:700,flexShrink:0}}>{initials}</div>;
}

function StatusBadge(props) {
  var v=props.v; var map=props.map||{};
  var colors=map[v]||["#F3F4F6","#6B7280"];
  return <span style={{background:colors[0],color:colors[1],borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>{v||"--"}</span>;
}
var TRADING_COLORS={"New Request":["#DBEAFE","#1E40AF"],"Position Closed":["#DCFCE7","#166534"]};
var MO_APR_COLORS={"Pending Approval":["#FEF3C7","#92400E"],"Approved":["#DCFCE7","#166534"]};
var BO_COLORS={"Pending":["#F3F4F6","#6B7280"],"Completed":["#DCFCE7","#166534"]};

function RoleSwitcher(props) {
  var viewRole=props.viewRole; var setViewRole=props.setViewRole; var cases=props.cases; var mode=props.mode;
  var roles=["Requester","Operations","AML","Middle Office","Trading"];
  return (
    <div style={{border:"2px solid #E5E7EB",borderRadius:12,padding:"12px 16px",background:"#F9FAFB",marginBottom:4}}>
      <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:10}}>Admin - View as role:</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {roles.map(function(r) {
          var color=ROLE_COLOR[r]||"#374151";
          var isActive=viewRole===r;
          var cnt=0;
          if(mode==="queue"){
            var qs=ROLE_QUEUE_STAGES[r]||[];
            cnt=cases.filter(function(c){return qs.includes(c.status);}).length;
          } else {
            var vs=ROLE_VISIBLE_STAGES[r]||[];
            cnt=cases.filter(function(c){return vs.includes(c.status);}).length;
          }
          return (
            <button key={r} onClick={function(){setViewRole(r);}}
              style={{padding:"8px 16px",fontSize:12,fontWeight:700,borderRadius:9,cursor:"pointer",
                border:"2px solid "+(isActive?color:"#E5E7EB"),
                background:isActive?color:"#fff",
                color:isActive?"#fff":color,
                display:"inline-flex",alignItems:"center",gap:8}}>
              {r}
              <span style={{background:isActive?"rgba(255,255,255,0.25)":color+"18",color:isActive?"#fff":color,borderRadius:99,padding:"1px 8px",fontSize:11,fontWeight:800}}>{cnt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProgressTracker(props) {
  var status=props.status;
  // Linear progress stages only (not terminal states)
  var LINEAR=["Submitted","Pending Ops","Pending AML","Broker Outreach","Execution Ready","Executing","Completed - Waiting Transfer","Completed"];
  var idx=LINEAR.indexOf(status);
  var pct=idx<0?0:Math.max(0,Math.min(100,Math.round((idx/(LINEAR.length-1))*100)));
  var isTerminal=status==="Rejected"||status==="Returned to Requester";
  return (
    <div style={{marginTop:12,padding:"12px 14px",background:"#F9FAFB",borderRadius:10,border:"1px solid #E5E7EB"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:600,color:"#374151"}}>Progress</span>
        <span style={{fontSize:11,color:isTerminal?"#DC2626":"#6B7280"}}>
          {isTerminal?status:pct+"% · "+(LINEAR.length-1-idx)+" stage"+(LINEAR.length-1-idx!==1?"s":"")+" remaining"}
        </span>
      </div>
      <div style={{height:5,background:"#E5E7EB",borderRadius:99,marginBottom:12}}>
        <div style={{height:"100%",width:isTerminal?"100%":pct+"%",
          background:status==="Completed"?"#16A34A":isTerminal?"#EF4444":"#6366F1",
          borderRadius:99}}/>
      </div>
      <div style={{display:"flex",overflowX:"auto",paddingBottom:2}}>
        {LINEAR.map(function(s,i){
          var done=i<idx; var cur=i===idx;
          return (
            <div key={s} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:"0 0 auto",minWidth:72,position:"relative"}}>
              {i>0&&<div style={{position:"absolute",top:9,right:"50%",width:"100%",height:2,background:done?"#16A34A":"#E5E7EB",zIndex:0}}/>}
              <div style={{width:20,height:20,borderRadius:"50%",
                background:done?"#16A34A":cur?(isTerminal?"#EF4444":"#6366F1"):"#fff",
                border:"2px solid "+(done?"#16A34A":cur?(isTerminal?"#EF4444":"#6366F1"):"#D1D5DB"),
                zIndex:1,display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:9,color:done||cur?"#fff":"#9CA3AF",fontWeight:700}}>
                {done?"✓":i+1}
              </div>
              <div style={{fontSize:9,color:cur?"#6366F1":done?"#16A34A":"#9CA3AF",textAlign:"center",marginTop:3,fontWeight:cur?700:400,lineHeight:1.2,maxWidth:66}}>
                {s}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DocStrip(props) {
  var caseData=props.caseData; var setCases=props.setCases; var user=props.user;
  var [label,setLabel]=useState("");
  function attach(file) {
    if(!file)return;
    var doc={name:file.name,label:label||file.name,by:user.name,date:new Date().toISOString().slice(0,10)};
    setCases(function(prev){return updateCase(prev,caseData.id,"documents",(caseData.documents||[]).concat([doc]));});
    setLabel("");
  }
  return (
    <div style={{border:"1px solid #E5E7EB",borderRadius:12,padding:13,background:"#fff"}}>
      <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>Documents ({(caseData.documents||[]).length})</div>
      {(caseData.documents||[]).map(function(d,i) {
        return <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#F9FAFB",borderRadius:8,marginBottom:4,border:"1px solid #E5E7EB"}}><span>D</span><div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{d.label}</div><div style={{fontSize:10,color:"#9CA3AF"}}>{d.name} - {d.by} - {d.date}</div></div></div>;
      })}
      <div style={{display:"flex",gap:7,marginTop:8}}>
        <input style={{flex:1,fontSize:12,border:"1px solid #E5E7EB",borderRadius:8,padding:"5px 9px"}} placeholder="Label..." value={label} onChange={function(e){setLabel(e.target.value);}}/>
        <label style={{display:"flex",alignItems:"center",gap:5,background:"#EEF2FF",color:"#4338CA",border:"1px solid #C7D2FE",borderRadius:8,padding:"5px 11px",cursor:"pointer",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>
          Upload<input type="file" style={{display:"none"}} onChange={function(e){attach(e.target.files[0]);}}/>
        </label>
      </div>
    </div>
  );
}

function OpsFields(props) {
  var c=props.c; var setCases=props.setCases;
  var [cfKey,setCfKey]=useState("");
  var [clubDraft,setClubDraft]=useState(c.opsClub||"");
  var clubSaved=clubDraft===(c.opsClub||"");

  function set1(field,val){setCases(function(prev){return updateCase(prev,c.id,field,val);});}
  function saveClub(){set1("opsClub",clubDraft);}

  return (
    <div style={{border:"1px solid #DDD6FE",borderRadius:12,padding:13,background:"#FAFAFF"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#7C3AED",marginBottom:12}}>Operations fields</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>

        {/* Reference — auto-generated, read-only */}
        <div style={{gridColumn:"1 / -1"}}>
          <label style={{fontSize:10,color:"#9CA3AF",display:"block",marginBottom:2}}>Reference (auto-generated)</label>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{flex:1,border:"1px solid #DDD6FE",borderRadius:6,padding:"6px 10px",fontSize:12,background:"#EDE9FE",color:"#5B21B6",fontFamily:"monospace",fontWeight:700,letterSpacing:0.5}}>
              {c.opsReference||"—"}
            </div>
            <div style={{fontSize:10,color:"#9CA3AF",flexShrink:0}}>unique per case · used in deduction files</div>
          </div>
        </div>

        {/* Club — local draft + explicit Save */}
        <div style={{gridColumn:"1 / -1"}}>
          <label style={{fontSize:10,color:"#9CA3AF",display:"block",marginBottom:2}}>
            Club <span style={{color:"#DC2626"}}>*</span>
            {c.opsClub&&<span style={{marginLeft:6,fontSize:9,fontWeight:700,color:"#166534",background:"#DCFCE7",borderRadius:99,padding:"1px 7px"}}>✓ Saved: {c.opsClub}</span>}
            {!c.opsClub&&<span style={{marginLeft:6,fontSize:9,fontWeight:700,color:"#92400E",background:"#FEF3C7",borderRadius:99,padding:"1px 7px"}}>Not yet set</span>}
          </label>
          <div style={{display:"flex",gap:7,alignItems:"center"}}>
            <select
              style={{flex:1,border:"1px solid "+(clubDraft?"#DDD6FE":"#FDE68A"),borderRadius:6,padding:"6px 8px",fontSize:12,background:clubDraft?"#fff":"#FFFBEB",color:clubDraft?"#374151":"#92400E",fontWeight:clubDraft?400:600,cursor:"pointer"}}
              value={clubDraft}
              onChange={function(e){setClubDraft(e.target.value);}}>
              <option value="">— Select club —</option>
              {["Bronze","Silver","Gold","Platinum","Platinum Plus","Diamond"].map(function(cl){
                return <option key={cl} value={cl}>{cl}</option>;
              })}
            </select>
            <button
              onClick={saveClub}
              disabled={clubSaved||!clubDraft}
              style={{
                background:(!clubSaved&&clubDraft)?"#7C3AED":"#D1D5DB",
                color:"#fff",border:"none",borderRadius:7,
                padding:"6px 16px",fontSize:12,fontWeight:700,
                cursor:(!clubSaved&&clubDraft)?"pointer":"not-allowed",
                whiteSpace:"nowrap",flexShrink:0
              }}>
              {clubSaved&&c.opsClub?"✓ Saved":"Save club"}
            </button>
          </div>
          {!clubSaved&&clubDraft&&(
            <div style={{fontSize:10,color:"#7C3AED",marginTop:4}}>Unsaved change — click Save club to confirm.</div>
          )}
        </div>

        {/* FCMU */}
        <div>
          <label style={{fontSize:10,color:"#9CA3AF",display:"block",marginBottom:2}}>FCMU approval</label>
          <select style={{width:"100%",border:"1px solid #E5E7EB",borderRadius:6,padding:"5px 7px",fontSize:11,background:"#fff"}} value={c.opsFCMU||""} onChange={function(e){set1("opsFCMU",e.target.value);}}>
            {["Pending","Approved","Rejected"].map(function(o){return <option key={o}>{o}</option>;})}
          </select>
        </div>

        {/* Sanction stock */}
        <div style={{display:"flex",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,padding:"7px 10px",background:c.opsSanctionStock?"#FEF2F2":"#F0FDF4",borderRadius:8,border:"1px solid "+(c.opsSanctionStock?"#FCA5A5":"#86EFAC"),width:"100%",boxSizing:"border-box"}}>
            <input type="checkbox" checked={!!c.opsSanctionStock} onChange={function(e){set1("opsSanctionStock",e.target.checked);}} style={{width:14,height:14,cursor:"pointer",flexShrink:0}}/>
            <span style={{fontSize:11,fontWeight:600,color:c.opsSanctionStock?"#991B1B":"#166534"}}>
              Sanction stock {c.opsSanctionStock?"⚠ YES":"✓ No"}
            </span>
          </div>
        </div>
      </div>

      {/* Custom fields */}
      {(c.opsCustomFields||[]).map(function(cf,i) {
        return (
          <div key={i} style={{display:"flex",gap:7,marginBottom:5,alignItems:"center"}}>
            <div style={{fontSize:10,color:"#7C3AED",fontWeight:600,width:110,flexShrink:0}}>{cf.key}</div>
            <input style={{flex:1,border:"1px solid #DDD6FE",borderRadius:6,padding:"4px 7px",fontSize:11}} value={cf.value} onChange={function(e){var v=e.target.value;set1("opsCustomFields",(c.opsCustomFields||[]).map(function(x,xi){return xi===i?{key:x.key,value:v}:x;}));}}/>
            <button onClick={function(){set1("opsCustomFields",(c.opsCustomFields||[]).filter(function(_,xi){return xi!==i;}));}} style={{color:"#EF4444",border:"none",background:"none",cursor:"pointer",fontSize:12}}>✕</button>
          </div>
        );
      })}
      <div style={{display:"flex",gap:7,marginTop:6}}>
        <input style={{flex:1,border:"1px dashed #DDD6FE",borderRadius:6,padding:"4px 7px",fontSize:11}} placeholder="+ Custom field name…" value={cfKey} onChange={function(e){setCfKey(e.target.value);}}/>
        <button onClick={function(){if(!cfKey.trim())return;set1("opsCustomFields",(c.opsCustomFields||[]).concat([{key:cfKey,value:""}]));setCfKey("");}} disabled={!cfKey.trim()} style={{background:cfKey.trim()?"#7C3AED":"#D1D5DB",color:"#fff",border:"none",borderRadius:6,padding:"4px 12px",fontSize:11,cursor:cfKey.trim()?"pointer":"not-allowed"}}>Add</button>
      </div>
    </div>
  );
}

function MOFields(props) {
  var c=props.c; var setCases=props.setCases;
  var [cfKey,setCfKey]=useState("");
  function set1(field,val){setCases(function(prev){return updateCase(prev,c.id,field,val);});}
  var moFields=[["MO ID","moMOID","text"],["CUSIP","moCUSIP","text"],["Hedge server","moHedgeServer","text"],["Liquidity account","moLiquidityAccount","text"],["LP main","moLP_Main","text"],["LP sub","moLP_Sub","text"],["Internal transfer date","moInternalTransferDate","date"],["Date of closure","moDateClosure","date"],["Value of closure","moValueClosure","text"]];
  return (
    <div style={{border:"1px solid #BFDBFE",borderRadius:12,padding:13,background:"#F8FAFF"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#2563EB",marginBottom:10}}>Middle Office fields</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}}>
        {moFields.map(function(def) {
          return (
            <div key={def[1]}>
              <label style={{fontSize:10,color:"#9CA3AF",display:"block",marginBottom:2}}>{def[0]}</label>
              <input type={def[2]} style={{width:"100%",border:"1px solid #BFDBFE",borderRadius:6,padding:"5px 7px",fontSize:11,boxSizing:"border-box"}} value={c[def[1]]||""} onChange={function(e){set1(def[1],e.target.value);}} placeholder={def[0]}/>
            </div>
          );
        })}
      </div>
      {(c.moCustomFields||[]).map(function(cf,i) {
        return (
          <div key={i} style={{display:"flex",gap:7,marginBottom:5,alignItems:"center"}}>
            <div style={{fontSize:10,color:"#2563EB",fontWeight:600,width:100,flexShrink:0}}>{cf.key}</div>
            <input style={{flex:1,border:"1px solid #BFDBFE",borderRadius:6,padding:"4px 7px",fontSize:11}} value={cf.value} onChange={function(e){var v=e.target.value;var nf=(c.moCustomFields||[]).map(function(x,xi){return xi===i?{key:x.key,value:v}:x;});set1("moCustomFields",nf);}}/>
            <button onClick={function(){set1("moCustomFields",(c.moCustomFields||[]).filter(function(_,xi){return xi!==i;}));}} style={{color:"#EF4444",border:"none",background:"none",cursor:"pointer",fontSize:12}}>X</button>
          </div>
        );
      })}
      <div style={{display:"flex",gap:7,marginTop:6}}>
        <input style={{flex:1,border:"1px dashed #BFDBFE",borderRadius:6,padding:"4px 7px",fontSize:11}} placeholder="+ Custom field..." value={cfKey} onChange={function(e){setCfKey(e.target.value);}}/>
        <button onClick={function(){if(!cfKey.trim())return;set1("moCustomFields",(c.moCustomFields||[]).concat([{key:cfKey,value:""}]));setCfKey("");}} disabled={!cfKey.trim()} style={{background:cfKey.trim()?"#2563EB":"#D1D5DB",color:"#fff",border:"none",borderRadius:6,padding:"4px 12px",fontSize:11,cursor:cfKey.trim()?"pointer":"not-allowed"}}>Add</button>
      </div>
    </div>
  );
}

function PositionsTable(props) {
  var rows=props.rows; var caseId=props.caseId; var setCases=props.setCases;
  var showMOApprove=props.showMOApprove||false;
  var showTradingInputs=props.showTradingInputs||false;
  var showBOStatus=props.showBOStatus||false;

  function updateRow(rowId,field,val) {
    setCases(function(prev) {
      return prev.map(function(c) {
        if(c.id!==caseId)return c;
        var newRows=c.execRows.map(function(r) {
          if(r.id!==rowId)return r;
          var nr=cloneObj(r); nr[field]=val;
          if(field==="moApproval"&&val==="Approved")nr.units="";
          if(nr.units&&nr.forexRate&&nr.payment)nr.tradingStatus="Position Closed";
          return nr;
        });
        var n=cloneObj(c); n.execRows=newRows; return n;
      });
    });
  }

  var cols=["#","CID","Asset","Instr ID","Position ID","Trading Status","MO Approval"];
  if(showTradingInputs)cols=cols.concat(["Units","End Forex Rate","Payment to acct"]);
  if(showBOStatus)cols=cols.concat(["BO Status"]);

  return (
    <div style={{overflowX:"auto",border:"1px solid #E5E7EB",borderRadius:8}}>
      <table style={{borderCollapse:"collapse",fontSize:10,width:"100%"}}>
        <thead>
          <tr style={{background:"#F1F5F9"}}>
            {cols.map(function(h){return <th key={h} style={{padding:"5px 8px",textAlign:"left",fontWeight:600,color:"#374151",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap"}}>{h}</th>;})}
          </tr>
        </thead>
        <tbody>
          {rows.map(function(r,ri) {
            var closed=r.tradingStatus==="Position Closed";
            var approved=r.moApproval==="Approved";
            return (
              <tr key={r.id} style={{background:closed?"#F0FDF4":ri%2?"#F9FAFB":"#fff",borderBottom:"1px solid #F3F4F6"}}>
                <td style={{padding:"4px 8px",color:"#9CA3AF"}}>{r.rowNum}</td>
                <td style={{padding:"4px 8px",fontFamily:"monospace",color:"#1D4ED8",fontSize:10}}>{r.cid}</td>
                <td style={{padding:"4px 8px",fontWeight:600}}>{r.asset}</td>
                <td style={{padding:"4px 8px",fontFamily:"monospace"}}>{r.instrumentID}</td>
                <td style={{padding:"4px 8px",fontFamily:"monospace",color:"#6366F1"}}>{r.positionID}</td>
                <td style={{padding:"4px 8px"}}><StatusBadge v={r.tradingStatus||"New Request"} map={TRADING_COLORS}/></td>
                <td style={{padding:"4px 8px"}}>
                  {showMOApprove
                    ?<button onClick={function(){updateRow(r.id,"moApproval",approved?"Pending Approval":"Approved");}} style={{fontSize:10,fontWeight:600,border:"none",borderRadius:6,padding:"3px 9px",cursor:"pointer",background:approved?"#DCFCE7":"#FEF3C7",color:approved?"#166534":"#92400E"}}>{approved?"Approved":"Pending - click to approve"}</button>
                    :<StatusBadge v={r.moApproval||"Pending Approval"} map={MO_APR_COLORS}/>}
                </td>
                {showTradingInputs&&(
                  <>
                    <td style={{padding:"3px 5px"}}><input style={{border:"1px solid #C7D2FE",borderRadius:5,padding:"2px 5px",fontSize:10,width:70,textAlign:"right"}} value={r.units||""} onChange={function(e){updateRow(r.id,"units",e.target.value);}}/></td>
                    <td style={{padding:"3px 5px"}}><input style={{border:"1px solid #C7D2FE",borderRadius:5,padding:"2px 5px",fontSize:10,width:60,textAlign:"right"}} value={r.forexRate||""} onChange={function(e){updateRow(r.id,"forexRate",e.target.value);}}/></td>
                    <td style={{padding:"3px 5px"}}><input style={{border:"1px solid #C7D2FE",borderRadius:5,padding:"2px 5px",fontSize:10,width:70,textAlign:"right"}} value={r.payment||""} onChange={function(e){updateRow(r.id,"payment",e.target.value);}}/></td>
                  </>
                )}
                {showBOStatus&&(
                  <td style={{padding:"4px 8px"}}>
                    <select style={{fontSize:10,border:"1px solid #E5E7EB",borderRadius:5,padding:"2px 5px",background:"#fff"}} value={r.boStatus||"Pending"} onChange={function(e){updateRow(r.id,"boStatus",e.target.value);}}>
                      <option>Pending</option>
                      <option>Completed</option>
                    </select>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FormDataPanel(props) {
  var c=props.c; var setCases=props.setCases; var user=props.user;
  var assets=c.formAssets||SEED_ASSETS[c.id]||[];
  var isCBO=(c.transferType||"NCBO")==="CBO";
  var hasSig=c.formSigned;
  var isMO=user&&user.role==="Middle Office";

  function setAssetField(idx,field,val){
    setCases&&setCases(function(prev){
      return prev.map(function(x){
        if(x.id!==c.id)return x;
        var n=cloneObj(x);
        var mapKey="moAsset_"+field;
        var map=cloneObj(x[mapKey]||{});
        map[idx]=val;
        n[mapKey]=map;
        return n;
      });
    });
  }

  return (
    <div style={{border:"2px solid #E0E7FF",borderRadius:12,padding:14,background:"#F8FAFF"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:12,fontWeight:700,color:"#4338CA"}}>Form details — visible to all teams</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,background:isCBO?"#FEF2F2":"#DCFCE7",color:isCBO?"#DC2626":"#166534",border:"1px solid "+(isCBO?"#FCA5A5":"#86EFAC")}}>{isCBO?"⚠ CBO":"✓ NCBO"}</span>
          {hasSig===true&&<span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,background:"#DCFCE7",color:"#166534",border:"1px solid #86EFAC"}}>✓ Signed</span>}
          {hasSig===false&&<span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,background:"#FEF2F2",color:"#DC2626",border:"1px solid #FCA5A5"}}>⚠ Signature missing</span>}
        </div>
      </div>
      {isCBO&&<div style={{background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:"#991B1B",fontWeight:600}}>🚫 CBO transfer — not accepted. Requester must resubmit as NCBO.</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
        {[["Client name",c.clientName],["Transfer reason",c.reason],["Approx. value","$"+Number(c.valueUSD).toLocaleString()],["Bank / broker name",c.broker],["Bank / broker email",c.brokerEmail||"--"],["Requester account name",c.requesterAccountName||"--"],["Requester account number",c.requesterAccountNumber||"--"],["Transfer type",c.transferType||"NCBO"],["Club",c.opsClub?(c.opsClub+" ✓"):(c.club||"--")],["Submitted date",c.submittedDate]].map(function(pair){
          var warn=pair[0]==="Transfer type"&&pair[1]==="CBO";
          return <div key={pair[0]} style={{background:"#fff",borderRadius:8,padding:"8px 10px",border:"1px solid "+(warn?"#FCA5A5":"#E0E7FF")}}><div style={{fontSize:9,color:"#9CA3AF",fontWeight:600,textTransform:"uppercase",marginBottom:2}}>{pair[0]}</div><div style={{fontSize:12,fontWeight:600,color:warn?"#DC2626":"#111827"}}>{pair[1]||"--"}</div></div>;
        })}
      </div>
      {assets.length>0?(
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <div style={{fontSize:11,fontWeight:700,color:"#4338CA"}}>Assets requested — {assets.length} instrument{assets.length!==1?"s":""}</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {isMO&&<span style={{fontSize:10,color:"#2563EB",background:"#DBEAFE",borderRadius:99,padding:"2px 9px",fontWeight:600}}>✏ Instrument ID &amp; ISIN editable</span>}
              <div style={{fontSize:11,fontWeight:700,color:"#DC2626",background:"#FEF2F2",borderRadius:99,padding:"2px 10px",border:"1px solid #FCA5A5"}}>Total fee: ${assets.length*100}</div>
            </div>
          </div>
          <div style={{border:"1px solid #C7D2FE",borderRadius:8,overflow:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%",fontSize:11}}>
              <thead>
                <tr style={{background:"#EEF2FF"}}>
                  {["#","Symbol","Security name","Reference","Qty","Exchange","Instrument ID","ISIN"].map(function(h){
                    var isMOCol=h==="Instrument ID"||h==="ISIN";
                    return <th key={h} style={{padding:"6px 10px",textAlign:"left",fontWeight:700,color:isMOCol?"#2563EB":"#4338CA",borderBottom:"1px solid #C7D2FE",whiteSpace:"nowrap",background:isMOCol?"#EFF6FF":"#EEF2FF"}}>{h}{isMO&&isMOCol?" ✏":""}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {assets.map(function(a,i){
                  var baseRef=c.opsReference||c.compensationNote||"ACATSOUT";
                  var refNum=parseInt(baseRef.replace(/[^0-9]/g,""))||500;
                  var refPrefix=baseRef.replace(/[0-9]+$/,"");
                  var assetRef=refPrefix+(refNum+i);
                  var instrID=(c.moAsset_instrumentID||{})[i]||"";
                  var isin=(c.moAsset_isin||{})[i]||"";
                  return (
                    <tr key={i} style={{background:i%2?"#F8FAFF":"#fff",borderBottom:"1px solid #E0E7FF"}}>
                      <td style={{padding:"6px 10px",color:"#9CA3AF"}}>{i+1}</td>
                      <td style={{padding:"6px 10px",fontWeight:800,fontFamily:"monospace",color:"#4338CA",fontSize:12}}>{a.symbol}</td>
                      <td style={{padding:"6px 10px",fontWeight:600,color:"#111827"}}>{a.name}</td>
                      <td style={{padding:"6px 10px",fontFamily:"monospace",fontSize:11,fontWeight:700,color:"#5B21B6",background:"#EDE9FE",whiteSpace:"nowrap"}}>{assetRef}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:"#1D4ED8"}}>{a.qty}</td>
                      <td style={{padding:"6px 10px",color:"#6B7280"}}>{a.exchange}</td>
                      <td style={{padding:"4px 6px",background:"#EFF6FF"}}>
                        {isMO?<input style={{border:"1px solid #BFDBFE",borderRadius:6,padding:"3px 7px",fontSize:11,width:90,fontFamily:"monospace",background:"#fff"}} placeholder="e.g. 1003" value={instrID} onChange={function(e){setAssetField(i,"instrumentID",e.target.value);}}/>:<span style={{fontFamily:"monospace",fontSize:11,color:instrID?"#1D4ED8":"#D1D5DB"}}>{instrID||"—"}</span>}
                      </td>
                      <td style={{padding:"4px 6px",background:"#EFF6FF"}}>
                        {isMO?<input style={{border:"1px solid #BFDBFE",borderRadius:6,padding:"3px 7px",fontSize:11,width:120,fontFamily:"monospace",background:"#fff"}} placeholder="e.g. US0231351067" value={isin} onChange={function(e){setAssetField(i,"isin",e.target.value);}}/>:<span style={{fontFamily:"monospace",fontSize:11,color:isin?"#1D4ED8":"#D1D5DB"}}>{isin||"—"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:8,fontSize:10,color:"#6B7280",fontStyle:"italic"}}>Data from the Securities Out Form. Instrument ID &amp; ISIN filled by Middle Office.</div>
        </div>
      ):(
        <div style={{fontSize:11,color:"#9CA3AF",fontStyle:"italic"}}>No asset data on record for this case.</div>
      )}
    </div>
  );
}

function MOBrokerPanel(props) {
  var c=props.c; var setCases=props.setCases; var user=props.user;
  function set1(field,val){setCases(function(prev){return updateCase(prev,c.id,field,val);});}
  var assets=SEED_ASSETS[c.id]||[];

  // ── Broker email compose state ──
  var [showCompose,setShowCompose]=useState(false);
  var [draftStatus,setDraftStatus]=useState(null); // null | "sending" | "sent" | "failed"

  // Broker communication status derived from case fields
  var brokerSent=!!c.brokerEmailSentAt;
  var brokerReplied=!!c.brokerRepliedAt;

  function markEmailSent(){
    var sentAt=new Date().toISOString();
    var to=c.brokerEmailTo||c.brokerEmail||"broker";
    var note={role:"Middle Office",byName:(user&&user.name)||"MO",
      text:"📧 Broker outreach email sent to "+to+" — awaiting reply.",
      date:new Date().toISOString().slice(0,10)};
    setCases(function(prev){return patchCase(prev,c.id,{
      brokerEmailSentAt:sentAt,
      status:"Broker Outreach",
      notes:(c.notes||[]).concat([note])
    });});
  }

  function markBrokerReplied(){
    var repliedAt=new Date().toISOString();
    var note={role:"Middle Office",byName:(user&&user.name)||"MO",
      text:"✅ Broker confirmed — reply received from "+(c.broker||"broker")+". Ready for execution.",
      date:new Date().toISOString().slice(0,10)};
    setCases(function(prev){return patchCase(prev,c.id,{
      brokerRepliedAt:repliedAt,
      status:"Execution Ready",
      notes:(c.notes||[]).concat([note])
    });});
  }

  // Build default email body from case data
  function buildEmailBody(customMsg){
    var assets=SEED_ASSETS[c.id]||[];
    // Build assets table rows
    var assetRows=assets.map(function(a,i){
      var instrID=(c.moAsset_instrumentID||{})[i]||"";
      var isin=(c.moAsset_isin||{})[i]||instrID||"";
      return a.symbol+"\t"+(isin||"—")+"\t"+a.qty;
    }).join("\n");
    var assetTable=assets.length>0
      ?"Symbol\tISINCode\tUnits\n"+assetRows
      :"[Assets to be confirmed]";

    return [
      "Dear "+(c.broker||"[Broker name]")+" team,",
      "",
      "I am writing to inform you that one of our clients, "+c.clientName+", wishes to transfer their position to your bank.",
      "We kindly request that you confirm your bank's ability to support this type of transfer and your willingness to receive the below instruments.",
      "",
      assetTable,
      "",
      "Client's U-number: "+c.cid,
      "",
      "To facilitate this process, please also provide your SSI details.",
      "",
      "Please do not hesitate to contact me if you require any further information. I look forward to your prompt response.",
      "",
      "Thanks",
    ].join("\n");
  }

  var [emailTo,setEmailTo]=useState(c.brokerEmail||"");
  var [emailSubject,setEmailSubject]=useState("[Transfers Hub] Securities Transfer Request — "+c.clientName+" ("+c.id+")");
  var [emailBody,setEmailBody]=useState("");

  // Initialise body when compose opens
  function openCompose(){
    setEmailTo(c.brokerEmail||"");
    setEmailSubject("Securities Transfer Request - "+c.clientName);
    setEmailBody(buildEmailBody(""));
    setDraftStatus(null);
    setShowCompose(true);
  }

  async function sendDraft(){
    if(!emailTo.trim()){return;}
    setDraftStatus("sending");
    try {
      var response=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          messages:[{role:"user",content:
            "Use the Gmail MCP tool gmail_create_draft to create a draft email with:\n"+
            "to: "+emailTo+"\n"+
            "subject: "+emailSubject+"\n"+
            "body:\n"+emailBody+"\n\n"+
            "Reply with only: DRAFT_CREATED or DRAFT_FAILED"
          }],
          mcp_servers:[{type:"url",url:"https://gmail.mcp.claude.com/mcp",name:"gmail-mcp"}]
        })
      });
      if(!response.ok) throw new Error("Draft API failed");
      var data=await response.json();
      var txt=(data.content||[]).map(function(b){return b.text||"";}).join("");
      if(txt.includes("DRAFT_CREATED")){
        setDraftStatus("sent");
        var note={role:"Middle Office",byName:(user&&user.name)||"MO",
          text:"📧 Broker email drafted in Gmail — to: "+emailTo+" | Subject: "+emailSubject,
          date:new Date().toISOString().slice(0,10)};
        setCases(function(prev){return patchCase(prev,c.id,{
          brokerDraftedAt:new Date().toISOString(),
          brokerEmailTo:emailTo,
          notes:(c.notes||[]).concat([note])
        });});
        // Close compose after 1.5s so MO sees the Mark as sent button
        setTimeout(function(){setShowCompose(false);setDraftStatus(null);},1500);
      } else {
        throw new Error("Draft response did not confirm creation");
      }
    } catch(e){
      var opened=openMailtoDraft(emailTo,emailSubject,emailBody);
      if(opened){
        setDraftStatus("fallback");
        var fallbackNote={role:"Middle Office",byName:(user&&user.name)||"MO",
          text:"📨 Email composer opened via local mail client (mailto) — to: "+emailTo+" | Subject: "+emailSubject,
          date:new Date().toISOString().slice(0,10)};
        setCases(function(prev){return patchCase(prev,c.id,{
          brokerDraftedAt:new Date().toISOString(),
          brokerEmailTo:emailTo,
          notes:(c.notes||[]).concat([fallbackNote])
        });});
      } else {
        setDraftStatus("failed");
      }
    }
  }

  return (
    <div style={{border:"2px solid #BFDBFE",borderRadius:12,padding:14,background:"#EFF6FF"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:12,fontWeight:700,color:"#1E40AF"}}>Broker details</div>
        <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
          {/* Communication status tracker */}
          <div style={{display:"flex",alignItems:"center",gap:0,background:"#fff",border:"1px solid #BFDBFE",borderRadius:99,overflow:"hidden",fontSize:10,fontWeight:700}}>
            {[
              {label:"Draft",     done:!!c.brokerDraftedAt, active:!!c.brokerDraftedAt&&!brokerSent},
              {label:"Sent",      done:brokerSent,           active:brokerSent&&!brokerReplied},
              {label:"Replied",   done:brokerReplied,        active:brokerReplied},
            ].map(function(step,i){
              return (
                <div key={step.label} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",
                  background:step.done?"#1E40AF":"transparent",
                  color:step.done?"#fff":"#9CA3AF",
                  borderRight:i<2?"1px solid #BFDBFE":"none"}}>
                  <span>{step.done?"✓":String(i+1)}</span>
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>
          {/* Action buttons based on current state */}
          {!c.brokerDraftedAt&&(
            <button onClick={openCompose}
              style={{display:"flex",alignItems:"center",gap:6,background:"#1E40AF",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              📧 Email broker
            </button>
          )}
          {c.brokerDraftedAt&&!brokerSent&&(
            <div style={{display:"flex",gap:6}}>
              <button onClick={openCompose}
                style={{background:"#EFF6FF",color:"#1E40AF",border:"1px solid #BFDBFE",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                ✏ Edit draft
              </button>
              <button onClick={markEmailSent}
                style={{background:"#0D9488",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                ✓ Mark as sent
              </button>
            </div>
          )}
          {brokerSent&&!brokerReplied&&(
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:11,color:"#0D9488",fontWeight:600,background:"#CCFBF1",borderRadius:99,padding:"3px 10px",border:"1px solid #99F6E4"}}>
                ⏳ Awaiting broker reply
              </span>
              <button onClick={markBrokerReplied}
                style={{background:"#16A34A",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                ✅ Broker replied
              </button>
            </div>
          )}
          {brokerReplied&&(
            <span style={{fontSize:11,color:"#166534",fontWeight:700,background:"#DCFCE7",borderRadius:99,padding:"3px 12px",border:"1px solid #86EFAC"}}>
              ✅ Broker confirmed — Execution Ready
            </span>
          )}
        </div>
      </div>

      {/* Sent / replied timestamps */}
      {(c.brokerDraftedAt||brokerSent||brokerReplied)&&(
        <div style={{display:"flex",gap:14,marginBottom:12,flexWrap:"wrap"}}>
          {c.brokerDraftedAt&&<div style={{fontSize:10,color:"#6B7280"}}><span style={{fontWeight:600,color:"#1E40AF"}}>Drafted:</span> {new Date(c.brokerDraftedAt).toLocaleString()} → {c.brokerEmailTo||c.brokerEmail}</div>}
          {brokerSent&&<div style={{fontSize:10,color:"#6B7280"}}><span style={{fontWeight:600,color:"#0D9488"}}>Sent:</span> {new Date(c.brokerEmailSentAt).toLocaleString()}</div>}
          {brokerReplied&&<div style={{fontSize:10,color:"#6B7280"}}><span style={{fontWeight:600,color:"#16A34A"}}>Replied:</span> {new Date(c.brokerRepliedAt).toLocaleString()}</div>}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:12}}>
        {[["Broker name","broker"],["Broker email","brokerEmail"],["Broker account no.","brokerAccount"]].map(function(pair) {
          return (
            <div key={pair[1]}>
              <div style={{fontSize:10,color:"#6B7280",fontWeight:600,marginBottom:4}}>{pair[0]}</div>
              <input style={{width:"100%",border:"1px solid #BFDBFE",borderRadius:7,padding:"6px 9px",fontSize:12,boxSizing:"border-box",background:"#fff"}} value={c[pair[1]]||""} onChange={function(e){set1(pair[1],e.target.value);}} placeholder={"Enter "+pair[0].toLowerCase()}/>
            </div>
          );
        })}
      </div>

      {assets.length>0&&(
        <div>
          <div style={{fontSize:11,fontWeight:700,color:"#1E40AF",marginBottom:6}}>Assets to transfer (from form)</div>
          <div style={{border:"1px solid #BFDBFE",borderRadius:8,overflow:"hidden"}}>
            <table style={{borderCollapse:"collapse",width:"100%",fontSize:11}}>
              <thead>
                <tr style={{background:"#DBEAFE"}}>
                  {["Symbol","Asset name","Qty (units requested)","Exchange"].map(function(h){return <th key={h} style={{padding:"6px 10px",textAlign:"left",fontWeight:700,color:"#1E40AF",borderBottom:"1px solid #BFDBFE"}}>{h}</th>;})}
                </tr>
              </thead>
              <tbody>
                {assets.map(function(a,i) {
                  return (
                    <tr key={i} style={{background:i%2?"#EFF6FF":"#fff",borderBottom:"1px solid #DBEAFE"}}>
                      <td style={{padding:"6px 10px",fontWeight:700,fontFamily:"monospace",color:"#4338CA"}}>{a.symbol}</td>
                      <td style={{padding:"6px 10px",fontWeight:600}}>{a.name}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:"#1E40AF"}}>{a.qty}</td>
                      <td style={{padding:"6px 10px",color:"#6B7280"}}>{a.exchange}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {assets.length===0&&(
        <div style={{fontSize:11,color:"#6B7280",padding:"8px 0"}}>No assets on record from form — populated during execution setup.</div>
      )}

      {/* ── Email compose panel ── */}
      {showCompose&&(
        <div style={{marginTop:16,border:"2px solid #1E40AF",borderRadius:12,background:"#fff",overflow:"hidden"}}>
          <div style={{background:"#1E40AF",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#fff"}}>📧 Compose broker outreach email</div>
            <button onClick={function(){setShowCompose(false);setDraftStatus(null);}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:12}}>✕ Close</button>
          </div>
          <div style={{padding:14,display:"flex",flexDirection:"column",gap:10}}>

            {/* To */}
            <div>
              <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>To <span style={{color:"#DC2626"}}>*</span></label>
              <input style={{width:"100%",border:"1px solid "+(emailTo?"#BFDBFE":"#FCA5A5"),borderRadius:7,padding:"7px 10px",fontSize:12,boxSizing:"border-box"}}
                placeholder="broker@example.com" value={emailTo} onChange={function(e){setEmailTo(e.target.value);}}/>
              {!emailTo&&<div style={{fontSize:10,color:"#DC2626",marginTop:2}}>Broker email required — enter above or fill in the broker email field.</div>}
            </div>

            {/* Subject */}
            <div>
              <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Subject</label>
              <input style={{width:"100%",border:"1px solid #E5E7EB",borderRadius:7,padding:"7px 10px",fontSize:12,boxSizing:"border-box"}}
                value={emailSubject} onChange={function(e){setEmailSubject(e.target.value);}}/>
            </div>

            {/* Body */}
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>Message</label>
                <button onClick={function(){setEmailBody(buildEmailBody(""));}} style={{fontSize:10,color:"#2563EB",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Reset to template</button>
              </div>
              <textarea style={{width:"100%",minHeight:260,border:"1px solid #E5E7EB",borderRadius:7,padding:"9px 11px",fontSize:11,fontFamily:"monospace",lineHeight:1.6,boxSizing:"border-box",resize:"vertical"}}
                value={emailBody} onChange={function(e){setEmailBody(e.target.value);}}/>
            </div>

            {/* Status + actions */}
            {draftStatus&&(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{padding:"9px 12px",borderRadius:8,fontSize:12,fontWeight:600,
                  background:draftStatus==="sending"?"#EFF6FF":draftStatus==="sent"?"#F0FDF4":draftStatus==="fallback"?"#FFFBEB":"#FEF2F2",
                  border:"1px solid "+(draftStatus==="sending"?"#BFDBFE":draftStatus==="sent"?"#86EFAC":draftStatus==="fallback"?"#FDE68A":"#FCA5A5"),
                  color:draftStatus==="sending"?"#1E40AF":draftStatus==="sent"?"#166534":draftStatus==="fallback"?"#92400E":"#991B1B"}}>
                  {draftStatus==="sending"&&"⏳ Creating Gmail draft…"}
                  {draftStatus==="sent"&&"✓ Draft saved in Gmail. Open Gmail, review, and send — then click \"Mark as sent\" to update the tracker."}
                  {draftStatus==="fallback"&&"⚠ Gmail draft service unavailable. Opened your local email app with prefilled content — send it, then click Mark as sent."}
                  {draftStatus==="failed"&&"✗ Could not create draft — check Gmail connection and try again."}
                </div>
                {(draftStatus==="sent"||draftStatus==="fallback")&&(
                  <button onClick={function(){markEmailSent();setShowCompose(false);setDraftStatus(null);}}
                    style={{background:"#0D9488",color:"#fff",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer",width:"100%"}}>
                    ✓ I've sent it — mark as sent &amp; update tracker
                  </button>
                )}
              </div>
            )}

            <div style={{display:"flex",gap:8}}>
              <button onClick={sendDraft}
                disabled={!emailTo.trim()||draftStatus==="sending"}
                style={{flex:1,background:emailTo.trim()&&draftStatus!=="sending"?"#1E40AF":"#D1D5DB",color:"#fff",border:"none",borderRadius:8,padding:"9px",fontSize:13,fontWeight:700,cursor:emailTo.trim()&&draftStatus!=="sending"?"pointer":"not-allowed"}}>
                {draftStatus==="sending"?"Creating draft…":"📧 Create draft / open mail app"}
              </button>
              <button onClick={function(){setShowCompose(false);setDraftStatus(null);}} style={{background:"#F3F4F6",color:"#374151",border:"none",borderRadius:8,padding:"9px 16px",fontSize:12,cursor:"pointer"}}>Cancel</button>
            </div>
            <div style={{fontSize:10,color:"#9CA3AF",textAlign:"center"}}>Primary path saves a Gmail draft. If Gmail draft service is unavailable, the app opens your local email client with prefilled content.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function MOTransferSummary(props) {
  var c=props.c;
  var rows=c.execRows||[];
  var assets=SEED_ASSETS[c.id]||[];
  var assetMap={};
  assets.forEach(function(a){assetMap[a.name.toLowerCase()]=a;});
  return (
    <div style={{border:"2px solid #86EFAC",borderRadius:12,padding:14,background:"#F0FDF4"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#166534",marginBottom:4}}>Execution summary - ready to transfer to broker</div>
      <div style={{fontSize:11,color:"#6B7280",marginBottom:12}}>Total USD: <strong style={{color:"#166534"}}>${c.tradingAmount||"--"}</strong> - {rows.length} position{rows.length!==1?"s":""}</div>
      <div style={{border:"1px solid #86EFAC",borderRadius:8,overflow:"hidden"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontSize:11}}>
          <thead>
            <tr style={{background:"#DCFCE7"}}>
              {["CID","Asset name","Instrument name","Instrument ID","Units transferred","USD amount"].map(function(h){return <th key={h} style={{padding:"6px 10px",textAlign:"left",fontWeight:700,color:"#166534",borderBottom:"1px solid #86EFAC",whiteSpace:"nowrap"}}>{h}</th>;})}
            </tr>
          </thead>
          <tbody>
            {rows.map(function(r,i) {
              var assetInfo=assetMap[r.asset.toLowerCase()]||{};
              return (
                <tr key={i} style={{background:i%2?"#F0FDF4":"#fff",borderBottom:"1px solid #DCFCE7"}}>
                  <td style={{padding:"6px 10px",fontFamily:"monospace",fontWeight:700,color:"#166534"}}>{r.cid}</td>
                  <td style={{padding:"6px 10px",fontWeight:600}}>{r.asset}</td>
                  <td style={{padding:"6px 10px",color:"#374151"}}>{assetInfo.name||r.asset}</td>
                  <td style={{padding:"6px 10px",fontFamily:"monospace",color:"#6366F1"}}>{r.instrumentID||"--"}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:"#1E40AF"}}>{r.units||"--"}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:"#166534"}}>{r.payment?"$"+r.payment:"--"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:10,padding:"8px 12px",background:"#DCFCE7",borderRadius:8,fontSize:11,color:"#166534"}}>
        Send the above to: <strong>{c.broker||"--"}</strong>{c.brokerEmail?" - "+c.brokerEmail:""}{c.brokerAccount?" - Account: "+c.brokerAccount:""}
      </div>
    </div>
  );
}

function CaseDetail(props) {
  var c=props.c; var setCases=props.setCases; var user=props.user;
  var onAdvance=props.onAdvance; var onReject=props.onReject;
  var [note,setNote]=useState("");
  var [returnReason,setReturnReason]=useState("");
  var [showReturn,setShowReturn]=useState(false);
  var [rejectReason,setRejectReason]=useState("");
  var [showReject,setShowReject]=useState(false);

  var action=NEXT_ACTION[c.status];
  var canAct=action&&STAGE_ROLE[c.status]===user.role;
  var isRequesterReturn=c.status==="Returned to Requester"&&user.role==="Requester";
  var isAMLReturn=c.status==="AML Review Pending"&&user.role==="Requester";
  var isAMLStage=c.status==="Pending AML"&&user.role==="AML";
  var isOpsStage=(c.status==="Submitted"||c.status==="Pending Ops")&&user.role==="Operations";

  // Use opsClub (Ops-verified) if set, otherwise fall back to submitted club value
  var effectiveClub=c.opsClub||c.club||"";
  var isVIP=effectiveClub==="Diamond"||effectiveClub==="Platinum Plus";

  // Checklist items config: [field, label, hasInput, inputField, inputPlaceholder]
  // VIP exemption applies ONLY to fullStockOut — all other items must be checked for everyone
  var CHECKLIST=[
    ["accountNormal",  "Account status normal",         false, null,            null],
    ["cashOk",         "Cash balance sufficient",        true,  "clientBalance", "Enter client balance (USD)"],
    ["formComplete",   "Form complete & legible",        false, null,            null],
    ["fullStockOut",   "Full stock-out requested",       false, null,            null],
    ["proofOwnership", "Proof of ownership attached",    false, null,            null],
    ["nwaZero",        "NWA = 0",                        false, null,            null],
    ["lockedZero",     "Locked amount",                  true,  "lockedAmount",  "Enter locked amount (0 if none)"],
    ["w8Ok",           "W8 form signed",                 false, null,            null],
  ];

  var totalFee=(c.formAssets||(c.instruments?[...Array(Number(c.instruments))]:[])).length*100||Number(c.fees)||0;

  function isExempt(field,val){
    // ONLY fullStockOut is exempt for VIP — nothing else
    return field==="fullStockOut"&&val===false&&isVIP;
  }

  var allChecked=CHECKLIST.every(function(item){
    var val=c[item[0]];
    return val===true||isExempt(item[0],val);
  });
  var anyFailed=CHECKLIST.some(function(item){
    var val=c[item[0]];
    return val===false&&!isExempt(item[0],val);
  });
  var anyPending=CHECKLIST.some(function(item){return c[item[0]]===null||c[item[0]]===undefined;});

  // Failed items for pre-populating return reason
  var failedItems=CHECKLIST.filter(function(item){
    var val=c[item[0]];
    return val===false&&!isExempt(item[0],val);
  });

  function setCheckItem(field,val){
    setCases(function(prev){return updateCase(prev,c.id,field,val);});
  }

  function addNote(){
    if(!note.trim())return;
    var n={role:user.role,byName:user.name,text:note,date:new Date().toISOString().slice(0,10)};
    setCases(function(prev){return updateCase(prev,c.id,"notes",c.notes.concat([n]));});
    setNote("");
  }
  function doReturn(){
    if(!returnReason.trim())return;
    // AML returning uses different status + note prefix than Ops returning
    var isAMLReturning=user.role==="AML";
    var newStatus=isAMLReturning?"AML Review Pending":"Returned to Requester";
    var notePrefix=isAMLReturning?"AML review pending:":"Returned to requester:";
    var n={role:user.role,byName:user.name,text:notePrefix+" "+returnReason,date:new Date().toISOString().slice(0,10)};
    setCases(function(prev){return patchCase(prev,c.id,{status:newStatus,notes:c.notes.concat([n])});});
    setShowReturn(false);setReturnReason("");if(onReject)onReject();
  }
  function doReject(){
    if(!rejectReason.trim())return;
    var n={role:user.role,byName:user.name,text:"Rejected: "+rejectReason,date:new Date().toISOString().slice(0,10)};
    setCases(function(prev){return patchCase(prev,c.id,{status:"Rejected",notes:c.notes.concat([n])});});
    setShowReject(false);setRejectReason("");if(onReject)onReject();
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:11,flex:1,overflowY:"auto"}}>

      {/* Case header */}
      <div style={{border:"1px solid #E5E7EB",borderRadius:12,padding:14,background:"#fff"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,color:"#9CA3AF"}}>{c.id} · {c.ticketRef}</div>
            <div style={{fontSize:17,fontWeight:700,color:"#111827",marginTop:1}}>{c.clientName}</div>
            <div style={{fontSize:12,color:"#6B7280"}}>{c.cid} · {c.country} · <span style={{fontWeight:600,color:c.opsClub?"#5B21B6":"#6B7280"}}>{effectiveClub||"Club TBC"}</span>{c.opsClub&&<span style={{fontSize:10,color:"#7C3AED",marginLeft:3}}>✓</span>} · by {c.submittedByName}</div>
          </div>
          <span style={bs(c.status)}>{c.status}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:12}}>
          {[["Broker",c.broker],["Instruments",c.instruments],["Value","$"+Number(c.valueUSD).toLocaleString()],["Fees","$"+c.fees],["Reason",c.reason],["Submitted",c.submittedDate],["Direction",c.direction],["Ticket",c.ticketRef]].map(function(pair){
            return <div key={pair[0]}><div style={{fontSize:9,color:"#9CA3AF",fontWeight:600,textTransform:"uppercase"}}>{pair[0]}</div><div style={{fontSize:12,fontWeight:600,color:"#111827",marginTop:1}}>{pair[1]||"--"}</div></div>;
          })}
        </div>
        <ProgressTracker status={c.status}/>
      </div>

      {/* ── VALIDATION CHECKLIST ── */}
      <div style={{border:"2px solid "+(anyFailed?"#FCA5A5":allChecked?"#86EFAC":"#E5E7EB"),borderRadius:12,padding:14,background:"#fff"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>Validation checklist</div>
          <div style={{fontSize:11,fontWeight:600,
            color:anyFailed?"#DC2626":allChecked?"#16A34A":anyPending?"#92400E":"#6B7280",
            background:anyFailed?"#FEF2F2":allChecked?"#DCFCE7":anyPending?"#FEF3C7":"#F3F4F6",
            borderRadius:99,padding:"2px 10px",border:"1px solid "+(anyFailed?"#FCA5A5":allChecked?"#86EFAC":anyPending?"#FDE68A":"#E5E7EB")}}>
            {anyFailed?"⚠ Issues found":allChecked?"✓ All clear":anyPending?"Pending review":"—"}
          </div>
        </div>

        {isOpsStage&&(
          <div style={{fontSize:11,color:"#7C3AED",background:"#F5F3FF",border:"1px solid #DDD6FE",borderRadius:7,padding:"6px 10px",marginBottom:10}}>
            ✏️ Review each item and mark pass or fail. You must clear all items before approving.
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6}}>
          {CHECKLIST.map(function(item){
            var field=item[0]; var label=item[1]; var hasInput=item[2];
            var inputField=item[3]; var inputPlaceholder=item[4];
            var val=c[field];
            var exempt=isExempt(field,val);
            var isFullStock=field==="fullStockOut";
            var isLocked=field==="lockedZero";
            var isCash=field==="cashOk";
            var canEdit=isOpsStage;

            var rowBg=val===null||val===undefined?"#F9FAFB":exempt?"#FFF7ED":val===true?"#F0FDF4":"#FEF2F2";
            var rowBorder=val===null||val===undefined?"#E5E7EB":exempt?"#FED7AA":val===true?"#86EFAC":"#FCA5A5";

            // Only fullStockOut gets strikethrough for VIP
            var displayLabel=(
              <span style={{
                fontSize:11,fontWeight:500,color:exempt?"#92400E":"#374151",flex:1,
                textDecoration:(isFullStock&&isVIP)?"line-through":"none",
                opacity:(isFullStock&&isVIP)?0.65:1
              }}>{label}</span>
            );

            return (
              <div key={field} style={{display:"flex",flexDirection:"column",gap:6,padding:"8px 10px",borderRadius:9,background:rowBg,border:"1px solid "+rowBorder,gridColumn:(hasInput&&canEdit)?"1 / -1":"auto"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,minHeight:28}}>
                  {canEdit?(
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      <button onClick={function(){setCheckItem(field,true);}} title="Pass"
                        style={{width:26,height:26,borderRadius:6,border:"2px solid "+(val===true?"#16A34A":"#D1D5DB"),background:val===true?"#16A34A":"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:val===true?"#fff":"#9CA3AF",fontWeight:700,padding:0,flexShrink:0}}>
                        ✓
                      </button>
                      <button onClick={function(){setCheckItem(field,false);}} title="Fail"
                        style={{width:26,height:26,borderRadius:6,border:"2px solid "+(val===false&&!exempt?"#DC2626":"#D1D5DB"),background:val===false&&!exempt?"#DC2626":"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:val===false&&!exempt?"#fff":"#9CA3AF",fontWeight:700,padding:0,flexShrink:0}}>
                        ✗
                      </button>
                    </div>
                  ):(
                    <span style={{fontSize:15,fontWeight:700,flexShrink:0,color:val===null||val===undefined?"#D1D5DB":exempt?"#EA580C":val===true?"#16A34A":"#DC2626"}}>
                      {val===null||val===undefined?"○":exempt?"~":val===true?"✓":"✗"}
                    </span>
                  )}

                  {displayLabel}

                  {/* Only fullStockOut shows VIP exempt badge */}
                  {isFullStock&&isVIP&&<span style={{fontSize:9,color:"#92400E",background:"#FEF3C7",borderRadius:99,padding:"1px 7px",flexShrink:0,whiteSpace:"nowrap"}}>exempt · {effectiveClub}</span>}
                  {!canEdit&&(val===null||val===undefined)&&<span style={{fontSize:9,color:"#9CA3AF",flexShrink:0}}>not reviewed</span>}
                </div>

                {/* Input sub-row */}
                {hasInput&&canEdit&&(
                  <div style={{display:"flex",gap:8,alignItems:"center",paddingLeft:60}}>
                    {isCash&&(
                      <>
                        <input
                          type="number"
                          style={{flex:1,border:"1px solid "+(val===true?"#86EFAC":val===false?"#FCA5A5":"#E5E7EB"),borderRadius:7,padding:"5px 9px",fontSize:12,background:"#fff"}}
                          placeholder={inputPlaceholder}
                          value={c[inputField]||""}
                          onChange={function(e){setCases(function(prev){return updateCase(prev,c.id,inputField,e.target.value);});}}
                        />
                        {c[inputField]&&Number(c[inputField])>=0&&(
                          <span style={{fontSize:11,color:"#6B7280",whiteSpace:"nowrap"}}>
                            vs total fee <strong>${totalFee.toLocaleString()}</strong>
                            {Number(c[inputField])>=totalFee
                              ?<span style={{color:"#16A34A",fontWeight:700}}> ✓ sufficient</span>
                              :<span style={{color:"#DC2626",fontWeight:700}}> ✗ insufficient</span>}
                          </span>
                        )}
                      </>
                    )}
                    {isLocked&&(
                      <>
                        <input
                          type="number"
                          style={{flex:1,border:"1px solid "+(val===true?"#86EFAC":val===false?"#FCA5A5":"#E5E7EB"),borderRadius:7,padding:"5px 9px",fontSize:12,background:"#fff"}}
                          placeholder={inputPlaceholder}
                          value={c[inputField]||""}
                          onChange={function(e){
                            var amt=e.target.value;
                            setCases(function(prev){return updateCase(prev,c.id,inputField,amt);});
                            if(amt!==""&&Number(amt)===0){setCheckItem(field,true);}
                            else if(amt!==""&&Number(amt)>0){setCheckItem(field,false);}
                          }}
                        />
                        <span style={{fontSize:11,color:"#6B7280",whiteSpace:"nowrap"}}>
                          {c[inputField]!==""&&c[inputField]!==undefined
                            ?(Number(c[inputField])===0
                              ?<span style={{color:"#16A34A",fontWeight:700}}>✓ No locked amount</span>
                              :<span style={{color:"#DC2626",fontWeight:700}}>⚠ ${Number(c[inputField]).toLocaleString()} locked</span>)
                            :"Enter 0 if none"}
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Read-only display */}
                {hasInput&&!canEdit&&c[inputField]&&(
                  <div style={{paddingLeft:28,fontSize:11,color:"#6B7280"}}>
                    {isCash&&<span>Balance on file: <strong>${Number(c[inputField]).toLocaleString()}</strong></span>}
                    {isLocked&&Number(c[inputField])>0&&<span style={{color:"#DC2626"}}>Locked: <strong>${Number(c[inputField]).toLocaleString()}</strong></span>}
                    {isLocked&&Number(c[inputField])===0&&<span style={{color:"#16A34A"}}>No locked amount</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Checklist summary for non-Ops users */}
        {!isOpsStage&&anyPending&&(
          <div style={{marginTop:8,fontSize:11,color:"#9CA3AF",fontStyle:"italic"}}>Awaiting Operations review.</div>
        )}
      </div>

      <FormDataPanel c={c} setCases={setCases} user={user}/>
      <DocStrip caseData={c} setCases={setCases} user={user}/>
      {user.role==="Operations"&&!isRequesterReturn&&<OpsFields c={c} setCases={setCases}/>}
      {user.role==="Middle Office"&&<MOFields c={c} setCases={setCases}/>}
      {user.role==="Middle Office"&&<MOBrokerPanel c={c} setCases={setCases} user={user}/>}
      {user.role==="Middle Office"&&c.status==="Completed - Waiting Transfer"&&c.execRows&&c.execRows.length>0&&<MOTransferSummary c={c}/>}

      {/* Notes */}
      <div style={{border:"1px solid #E5E7EB",borderRadius:12,padding:13,background:"#fff"}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:9}}>Internal notes</div>
        {c.notes.length===0&&<div style={{fontSize:12,color:"#9CA3AF",marginBottom:8}}>No notes yet.</div>}
        {c.notes.map(function(n,i){return(
          <div key={i} style={{borderLeft:"3px solid "+(ROLE_COLOR[n.role]||"#D1D5DB"),paddingLeft:10,marginBottom:9}}>
            <div style={{fontSize:10,color:"#9CA3AF"}}>{n.byName} ({n.role}) · {n.date}</div>
            <div style={{fontSize:12,marginTop:2}}>{n.text}</div>
          </div>
        );})}
        <div style={{display:"flex",gap:7,marginTop:6}}>
          <input style={{flex:1,fontSize:12,border:"1px solid #E5E7EB",borderRadius:8,padding:"6px 9px"}} placeholder="Add note..." value={note} onChange={function(e){setNote(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")addNote();}}/>
          <button onClick={addNote} style={{background:"#2563EB",color:"#fff",fontSize:12,border:"none",borderRadius:8,padding:"6px 13px",cursor:"pointer"}}>Add</button>
        </div>
      </div>

      {/* Execution Ready — no queue action, direct to Execution tab */}
      {c.status==="Execution Ready"&&(
        <div style={{border:"2px solid #86EFAC",borderRadius:12,padding:14,background:"#F0FDF4"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#166534",marginBottom:6}}>✓ Ready for execution</div>
          <div style={{fontSize:12,color:"#166534",lineHeight:1.6}}>
            This case is ready to be executed. Go to the <strong>Execution tab</strong> to set the transfer date, load positions, approve and complete the closure.
          </div>
        </div>
      )}

      {/* Executing — inform all viewers it's in progress */}
      {c.status==="Executing"&&(
        <div style={{border:"2px solid #C7D2FE",borderRadius:12,padding:14,background:"#EEF2FF"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#3730A3",marginBottom:6}}>⚡ Execution in progress</div>
          <div style={{fontSize:12,color:"#4338CA",lineHeight:1.6}}>
            This case is currently being executed. Go to the <strong>Execution tab</strong> to manage positions, trading closure and BO status.
          </div>
        </div>
      )}

      {/* Action panel */}
      {canAct&&(
        <div style={{border:"1px solid #E5E7EB",borderRadius:12,padding:14,background:"#fff"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#111827",marginBottom:12}}>Action</div>

          {/* Ops: checklist gate */}
          {isOpsStage&&anyPending&&(
            <div style={{background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:9,padding:"10px 13px",marginBottom:12,fontSize:12,color:"#92400E"}}>
              ⚠ {CHECKLIST.filter(function(item){return c[item[0]]===null||c[item[0]]===undefined;}).length} checklist item{CHECKLIST.filter(function(item){return c[item[0]]===null||c[item[0]]===undefined;}).length!==1?"s":""} not yet reviewed — complete before approving.
            </div>
          )}
          {isOpsStage&&anyFailed&&!anyPending&&(
            <div style={{background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:9,padding:"10px 13px",marginBottom:12,fontSize:12,color:"#991B1B"}}>
              ✗ {failedItems.length} item{failedItems.length!==1?"s":""} failed: {failedItems.map(function(i){return i[1];}).join(", ")} — return to requester or reject.
            </div>
          )}

          {/* Return to requester modal — pre-fills failed items, adds extra comment */}
          {showReturn&&(
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12,background:"#FFF7ED",border:"2px solid #FED7AA",borderRadius:10,padding:14}}>
              <div style={{fontSize:12,fontWeight:700,color:"#92400E"}}>
                {isAMLStage?"↩ Request additional information from requester":"↩ Return to requester"}
              </div>

              {/* Pre-filled failed items as selectable chips */}
              {failedItems.length>0&&(
                <div>
                  <div style={{fontSize:11,color:"#78350F",marginBottom:6,fontWeight:600}}>Issues detected from checklist (tap to include):</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {failedItems.map(function(item){
                      var isIncluded=returnReason.includes(item[1]);
                      return (
                        <button key={item[0]}
                          onClick={function(){
                            setReturnReason(function(prev){
                              if(isIncluded){
                                return prev.replace(item[1]+"\n","").replace(item[1],"").trim();
                              }
                              return (prev?prev+"\n":"")+item[1];
                            });
                          }}
                          style={{fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:99,cursor:"pointer",border:"2px solid "+(isIncluded?"#EA580C":"#FED7AA"),background:isIncluded?"#EA580C":"#fff",color:isIncluded?"#fff":"#92400E"}}>
                          {isIncluded?"✓ ":""}{item[1]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Combined reason box */}
              <div>
                <div style={{fontSize:11,color:"#78350F",marginBottom:4,fontWeight:600}}>
                  {failedItems.length>0?"Additional comments / instructions for requester:":"Reason for returning:"}
                </div>
                <textarea
                  style={{width:"100%",border:"1px solid #FDE68A",borderRadius:8,padding:"7px 10px",fontSize:12,minHeight:60,resize:"vertical",boxSizing:"border-box"}}
                  placeholder="e.g. Please re-upload a clearer copy of the proof of ownership..."
                  value={failedItems.length>0
                    ? returnReason.split("\n").filter(function(l){return !failedItems.map(function(i){return i[1];}).includes(l);}).join("\n")
                    : returnReason}
                  onChange={function(e){
                    var extraText=e.target.value;
                    var checkedLabels=failedItems.filter(function(item){return returnReason.includes(item[1]);}).map(function(i){return i[1];});
                    setReturnReason((checkedLabels.length?checkedLabels.join("\n")+"\n":"")+extraText);
                  }}
                />
              </div>

              {/* Preview of full message */}
              {returnReason.trim()&&(
                <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:7,padding:"8px 10px",fontSize:11,color:"#78350F"}}>
                  <div style={{fontWeight:600,marginBottom:4}}>Message to requester:</div>
                  <div style={{whiteSpace:"pre-line"}}>{returnReason.trim()}</div>
                </div>
              )}

              <div style={{display:"flex",gap:7}}>
                <button onClick={doReturn} disabled={!returnReason.trim()} style={{background:returnReason.trim()?"#EA580C":"#D1D5DB",color:"#fff",fontSize:12,border:"none",borderRadius:8,padding:"8px 18px",cursor:returnReason.trim()?"pointer":"not-allowed",fontWeight:700}}>↩ Send return</button>
                <button onClick={function(){setShowReturn(false);setReturnReason("");}} style={{background:"#F3F4F6",color:"#374151",fontSize:12,border:"none",borderRadius:8,padding:"8px 13px",cursor:"pointer"}}>Cancel</button>
              </div>
            </div>
          )}

          {showReject&&(
            <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:12,background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:9,padding:12}}>
              <div style={{fontSize:12,fontWeight:600,color:"#991B1B"}}>
                {isAMLReturn?"Cancel request":"Reason for rejection"}
              </div>
              <textarea style={{width:"100%",border:"1px solid #FCA5A5",borderRadius:8,padding:"7px 10px",fontSize:12,minHeight:70,resize:"vertical",boxSizing:"border-box"}}
                placeholder={isAMLReturn?"Reason for cancelling this transfer request...":"e.g. CBO transfer — not accepted..."}
                value={rejectReason} onChange={function(e){setRejectReason(e.target.value);}}/>
              <div style={{display:"flex",gap:7}}>
                <button onClick={doReject} disabled={!rejectReason.trim()} style={{background:rejectReason.trim()?"#DC2626":"#D1D5DB",color:"#fff",fontSize:12,border:"none",borderRadius:8,padding:"7px 16px",cursor:rejectReason.trim()?"pointer":"not-allowed",fontWeight:600}}>✗ Confirm reject</button>
                <button onClick={function(){setShowReject(false);setRejectReason("");}} style={{background:"#F3F4F6",color:"#374151",fontSize:12,border:"none",borderRadius:8,padding:"7px 13px",cursor:"pointer"}}>Cancel</button>
              </div>
            </div>
          )}

          {/* Main action buttons */}
          {!showReturn&&!showReject&&(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>

              {/* Requester: returned from Ops */}
              {isRequesterReturn&&(
                <div style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:9,padding:"10px 13px",fontSize:12,color:"#78350F",lineHeight:1.6}}>
                  <div style={{fontWeight:700,marginBottom:4}}>↩ Returned by Operations</div>
                  {(function(){
                    var n=(c.notes||[]).slice().reverse().find(function(n){return n.text.startsWith("Returned to requester:");});
                    return n?<div style={{whiteSpace:"pre-line"}}>{n.text.replace("Returned to requester:","").trim()}</div>:<div style={{color:"#9CA3AF"}}>See notes above for details.</div>;
                  })()}
                  <div style={{marginTop:8,fontSize:11,color:"#92400E"}}>Address the issues then re-submit to Operations.</div>
                </div>
              )}

              {/* Requester: returned from AML */}
              {isAMLReturn&&(
                <div style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:9,padding:"10px 13px",fontSize:12,color:"#78350F",lineHeight:1.6}}>
                  <div style={{fontWeight:700,marginBottom:4}}>↩ Additional information requested by AML</div>
                  {(function(){
                    var n=(c.notes||[]).slice().reverse().find(function(n){return n.text.startsWith("AML review pending:");});
                    return n?<div style={{whiteSpace:"pre-line"}}>{n.text.replace("AML review pending:","").trim()}</div>:<div style={{color:"#9CA3AF"}}>See notes above for details.</div>;
                  })()}
                  <div style={{marginTop:8,fontSize:11,color:"#92400E"}}>Provide the requested information in the notes, then re-submit to AML — or cancel the request entirely.</div>
                </div>
              )}

              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {/* Approve / advance — styled by context */}
                <button
                  onClick={function(){if(onAdvance)onAdvance();}}
                  disabled={isOpsStage&&(anyPending||anyFailed)}
                  style={{
                    flex:1,
                    background:
                      (isRequesterReturn||isAMLReturn)?"#EA580C":
                      (isOpsStage&&(anyPending||anyFailed))?"#D1D5DB":"#16A34A",
                    color:"#fff",fontSize:13,fontWeight:700,border:"none",borderRadius:10,
                    padding:"11px 20px",
                    cursor:(isOpsStage&&(anyPending||anyFailed))?"not-allowed":"pointer",
                    minWidth:140
                  }}>
                  {isRequesterReturn?"↑ Re-submit to Operations":
                   isAMLReturn?"↑ Re-submit to AML":
                   "✓ "+action.label}
                </button>

                {/* Return to requester — Ops stage only */}
                {isOpsStage&&(
                  <button onClick={function(){setShowReturn(true);setShowReject(false);}}
                    style={{background:"#FFF7ED",color:"#92400E",fontSize:13,fontWeight:700,border:"2px solid #FED7AA",borderRadius:10,padding:"11px 16px",cursor:"pointer"}}>
                    ↩ Return
                  </button>
                )}

                {/* AML: Return to Requester for additional info */}
                {isAMLStage&&(
                  <button onClick={function(){setShowReturn(true);setShowReject(false);}}
                    style={{background:"#FFF7ED",color:"#92400E",fontSize:13,fontWeight:700,border:"2px solid #FED7AA",borderRadius:10,padding:"11px 16px",cursor:"pointer"}}>
                    ↩ Request info
                  </button>
                )}

                {/* Cancel request — only for Requester when returned from AML */}
                {isAMLReturn&&(
                  <button onClick={function(){setShowReject(true);setShowReturn(false);}}
                    style={{background:"#FEF2F2",color:"#DC2626",fontSize:13,fontWeight:700,border:"2px solid #FCA5A5",borderRadius:10,padding:"11px 16px",cursor:"pointer"}}>
                    ✗ Cancel request
                  </button>
                )}

                {/* Reject — shown for Ops/AML/MO, hidden for Requester */}
                {!isRequesterReturn&&!isAMLReturn&&(
                  <button onClick={function(){setShowReject(true);setShowReturn(false);}}
                    style={{background:"#FEF2F2",color:"#DC2626",fontSize:13,fontWeight:700,border:"2px solid #FCA5A5",borderRadius:10,padding:"11px 16px",cursor:"pointer"}}>
                    ✗ Reject
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OverviewTab(props) {
  var cases=props.cases; var user=props.user;
  var [tick,setTick]=useState(0);
  var [animDone,setAnimDone]=useState(false);

  // Animate in on mount
  useState(function(){
    var t=setTimeout(function(){setAnimDone(true);},100);
    return function(){clearTimeout(t);};
  });

  var now=new Date();
  var timeStr=now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  var dateStr=now.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"});

  // ── REQUESTER VIEW ────────────────────────────────────────────
  if(user&&user.role==="Requester"){
    var mine=cases.filter(function(c){return c.submittedBy===user.email||c.submittedBy===user.id;});
    var myActive=mine.filter(function(c){return !["Completed","Rejected"].includes(c.status);});
    var myCompleted=mine.filter(function(c){return c.status==="Completed";});
    var myRejected=mine.filter(function(c){return c.status==="Rejected";});
    var myReturned=mine.filter(function(c){return c.status==="Returned to Requester"||c.status==="AML Review Pending";});
    var myTotalValue=mine.reduce(function(s,c){return s+Number(c.valueUSD||0);},0);
    return (
      <div style={{display:"flex",flexDirection:"column",gap:0,fontFamily:"'DM Sans',system-ui,sans-serif"}}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} @keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}} .req-card{animation:slideUp .35s ease both}`}</style>

        {/* Hero */}
        <div style={{background:"linear-gradient(135deg,#0F172A 0%,#134E4A 50%,#0F172A 100%)",borderRadius:16,marginBottom:16,padding:"28px 28px 24px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,opacity:0.08,backgroundImage:"linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",backgroundSize:"40px 40px"}}/>
          <div style={{position:"absolute",top:-40,right:60,width:200,height:200,borderRadius:"50%",background:"#0D9488",opacity:0.15,filter:"blur(60px)"}}/>
          <div style={{position:"relative",zIndex:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:"#94A3B8",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>ACAT Out · My Requests</div>
                <div style={{fontSize:28,fontWeight:800,color:"#F8FAFC",letterSpacing:-0.5,lineHeight:1.1}}>
                  Welcome{user&&user.name?", "+user.name.split(" ")[0]:""}
                </div>
                <div style={{fontSize:13,color:"#64748B",marginTop:4}}>{dateStr} · {timeStr}</div>
              </div>
              {myReturned.length>0&&(
                <div style={{display:"flex",alignItems:"center",gap:7,background:"rgba(234,88,12,0.15)",borderRadius:99,padding:"7px 14px",border:"1px solid rgba(234,88,12,0.3)"}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:"#F97316",boxShadow:"0 0 8px #F97316",animation:"pulse 1.5s infinite"}}/>
                  <span style={{fontSize:12,fontWeight:700,color:"#FB923C"}}>{myReturned.length} request{myReturned.length!==1?"s":""} need your attention</span>
                </div>
              )}
            </div>
            {/* KPI row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
              {[
                {label:"My requests",   val:mine.length,       color:"#5EEAD4", icon:"📋"},
                {label:"In progress",   val:myActive.length,   color:"#818CF8", icon:"⚡"},
                {label:"Completed",     val:myCompleted.length,color:"#34D399", icon:"✓"},
                {label:"Total value",   val:"$"+Math.round(myTotalValue/1000)+"k", color:"#FCD34D", icon:"💰"},
              ].map(function(k){
                return (
                  <div key={k.label} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"14px 16px",backdropFilter:"blur(10px)"}}>
                    <div style={{fontSize:20,marginBottom:4}}>{k.icon}</div>
                    <div style={{fontSize:26,fontWeight:800,color:k.color,lineHeight:1}}>{k.val}</div>
                    <div style={{fontSize:11,color:"#64748B",marginTop:4,fontWeight:500}}>{k.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action needed banner */}
        {myReturned.length>0&&(
          <div style={{background:"#FFF7ED",border:"2px solid #FED7AA",borderRadius:12,padding:"14px 18px",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:22}}>↩</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:"#92400E"}}>{myReturned.length} request{myReturned.length!==1?"s":""} returned — action required</div>
              <div style={{fontSize:11,color:"#B45309",marginTop:2}}>Go to <strong>My Queue</strong> or <strong>My Requests</strong> to re-submit.</div>
            </div>
            <span style={{fontSize:11,fontWeight:700,background:"#FDBA74",color:"#7C2D12",borderRadius:99,padding:"3px 12px"}}>Pending your action</span>
          </div>
        )}

        {/* My requests list */}
        <div style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:"18px 20px",marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:700,color:"#111827",marginBottom:14}}>My requests</div>
          {mine.length===0&&(
            <div style={{textAlign:"center",padding:"36px 0",color:"#9CA3AF"}}>
              <div style={{fontSize:28,marginBottom:8}}>📋</div>
              <div style={{fontSize:13,fontWeight:600}}>No requests yet</div>
              <div style={{fontSize:11,marginTop:4}}>Use <strong>New Request</strong> to submit your first transfer request.</div>
            </div>
          )}
          {mine.map(function(c,i){
            var isReturned=c.status==="Returned to Requester"||c.status==="AML Review Pending";
            var returnNote=(c.notes||[]).slice().reverse().find(function(n){return n.text.startsWith("Returned to requester:")||n.text.startsWith("AML review pending:");});
            return (
              <div key={c.id} className="req-card" style={{animationDelay:(i*60)+"ms",border:"2px solid "+(isReturned?"#FED7AA":"#F3F4F6"),borderRadius:10,padding:"12px 14px",marginBottom:8,background:isReturned?"#FFFBEB":"#FAFAFA"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                  <div>
                    <div style={{fontSize:10,color:"#9CA3AF",marginBottom:2}}>{c.id} · {c.ticketRef}</div>
                    <div style={{fontSize:14,fontWeight:700,color:"#111827"}}>{c.clientName}</div>
                    <div style={{fontSize:11,color:"#6B7280"}}>{c.cid} · {c.broker} · ${Number(c.valueUSD).toLocaleString()}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                    <span style={bs(c.status)}>{c.status}</span>
                    <div style={{fontSize:10,color:"#9CA3AF"}}>{c.submittedDate}</div>
                  </div>
                </div>
                {/* Progress bar */}
                {(function(){
                  var LINEAR=["Submitted","Pending Ops","Pending AML","Broker Outreach","Execution Ready","Executing","Completed - Waiting Transfer","Completed"];
                  var idx=LINEAR.indexOf(c.status);
                  var pct=idx<0?0:Math.round(idx/(LINEAR.length-1)*100);
                  return (
                    <div style={{marginTop:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <div style={{fontSize:10,color:"#9CA3AF"}}>Progress</div>
                        <div style={{fontSize:10,fontWeight:600,color:c.status==="Completed"?"#16A34A":isReturned?"#EA580C":"#6366F1"}}>{isReturned?"Action required":c.status==="Completed"?"Complete":pct+"%"}</div>
                      </div>
                      <div style={{height:4,background:"#F3F4F6",borderRadius:99,overflow:"hidden"}}>
                        <div style={{height:"100%",width:(c.status==="Completed"?100:isReturned?pct:pct)+"%",background:c.status==="Completed"?"#16A34A":isReturned?"#F97316":"#6366F1",borderRadius:99,transition:"width .8s ease"}}/>
                      </div>
                    </div>
                  );
                })()}
                {/* Return reason */}
                {isReturned&&returnNote&&(
                  <div style={{marginTop:8,background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:7,padding:"6px 10px",fontSize:11,color:"#78350F",lineHeight:1.5}}>
                    <strong>↩ {c.status==="AML Review Pending"?"AML":"Operations"}:</strong> {returnNote.text.replace("Returned to requester:","").replace("AML review pending:","").trim()}
                  </div>
                )}
                {/* Latest note from team */}
                {!isReturned&&c.notes&&c.notes.length>0&&(function(){
                  var last=c.notes[c.notes.length-1];
                  return (
                    <div style={{marginTop:8,borderLeft:"3px solid "+(ROLE_COLOR[last.role]||"#D1D5DB"),paddingLeft:8,fontSize:11,color:"#374151"}}>
                      <span style={{color:"#9CA3AF",fontSize:10}}>{last.byName} · {last.date} </span>{last.text}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Summary stats */}
        {mine.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
            {[
              {label:"Active",    val:myActive.length,    color:"#6366F1", sub:myActive.length>0?"in the pipeline":"all clear"},
              {label:"Completed", val:myCompleted.length, color:"#22C55E", sub:"successfully transferred"},
              {label:"Rejected",  val:myRejected.length,  color:"#EF4444", sub:myRejected.length>0?"contact support":"none rejected"},
            ].map(function(s){
              return (
                <div key={s.label} style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:12,padding:"16px 18px",borderTop:"3px solid "+s.color}}>
                  <div style={{fontSize:28,fontWeight:800,color:s.color}}>{s.val}</div>
                  <div style={{fontSize:12,fontWeight:700,color:"#111827",marginTop:2}}>{s.label}</div>
                  <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{s.sub}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  // ── END REQUESTER VIEW ────────────────────────────────────────

  // Ops/Admin/other roles — full pipeline view
  var pending=cases.filter(function(c){return !["Completed","Rejected"].includes(c.status);});
  var completed=cases.filter(function(c){return c.status==="Completed";});
  var rejected=cases.filter(function(c){return c.status==="Rejected";});
  var totalValue=cases.reduce(function(s,c){return s+Number(c.valueUSD||0);},0);

  var stageCounts={};
  STAGES.forEach(function(s){stageCounts[s]=cases.filter(function(c){return c.status===s;}).length;});

  var PIPELINE=[
    {s:"Submitted",        role:"Operations",     color:"#7C3AED"},
    {s:"Pending Ops",      role:"Operations",     color:"#7C3AED"},
    {s:"Pending AML",      role:"AML",            color:"#EA580C"},
    {s:"AML Review Pending",role:"AML",           color:"#EA580C"},
    {s:"Broker Outreach",  role:"Middle Office",  color:"#2563EB"},
    {s:"Execution Ready",  role:"Middle Office",  color:"#2563EB"},
    {s:"Executing",        role:"Trading",        color:"#4338CA"},
    {s:"Completed - Waiting Transfer",role:"Middle Office",color:"#0D9488"},
    {s:"Completed",        role:null,             color:"#16A34A"},
    {s:"Rejected",         role:null,             color:"#EF4444"},
  ];

  var ROLE_STATS=[
    {role:"Operations",    color:"#7C3AED", stages:["Submitted","Pending Ops"]},
    {role:"AML",           color:"#EA580C", stages:["Pending AML","AML Review Pending"]},
    {role:"Middle Office", color:"#2563EB", stages:["Broker Outreach","Execution Ready","Completed - Waiting Transfer"]},
    {role:"Trading",       color:"#4338CA", stages:["Executing"]},
  ];

  // SVG donut ring helper
  function Donut(p){
    var r=28; var circ=2*Math.PI*r;
    var pct=p.total>0?p.count/p.total:0;
    var dash=pct*circ;
    return (
      <svg width={70} height={70} viewBox="0 0 70 70">
        <circle cx={35} cy={35} r={r} fill="none" stroke={p.color+"22"} strokeWidth={8}/>
        <circle cx={35} cy={35} r={r} fill="none" stroke={p.color} strokeWidth={8}
          strokeDasharray={dash+" "+(circ-dash)}
          strokeDashoffset={circ/4}
          strokeLinecap="round"
          style={{transition:"stroke-dasharray 1s cubic-bezier(.4,0,.2,1)"}}/>
        <text x={35} y={39} textAnchor="middle" fontSize={16} fontWeight={800} fill={p.color}>{p.count}</text>
      </svg>
    );
  }

  var now=new Date();
  var timeStr=now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  var dateStr=now.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"});

  return (
    <div style={{display:"flex",flexDirection:"column",gap:0,fontFamily:"'DM Sans',system-ui,sans-serif"}}>

      {/* ── HERO BANNER ── */}
      <div style={{
        background:"linear-gradient(135deg,#0F172A 0%,#1E1B4B 50%,#0F172A 100%)",
        borderRadius:16,marginBottom:16,padding:"28px 28px 24px",position:"relative",overflow:"hidden"
      }}>
        {/* Background grid lines */}
        <div style={{position:"absolute",inset:0,opacity:0.08,backgroundImage:"linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",backgroundSize:"40px 40px"}}/>
        {/* Glow blobs */}
        <div style={{position:"absolute",top:-40,right:60,width:200,height:200,borderRadius:"50%",background:"#7C3AED",opacity:0.15,filter:"blur(60px)"}}/>
        <div style={{position:"absolute",bottom:-20,left:80,width:160,height:160,borderRadius:"50%",background:"#2563EB",opacity:0.12,filter:"blur(50px)"}}/>

        <div style={{position:"relative",zIndex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:"#94A3B8",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>ACAT Out · Command Centre</div>
              <div style={{fontSize:28,fontWeight:800,color:"#F8FAFC",letterSpacing:-0.5,lineHeight:1.1}}>
                Welcome{user&&user.name?", "+user.name.split(" ")[0]:""}
              </div>
              <div style={{fontSize:13,color:"#64748B",marginTop:4}}>{dateStr} · {timeStr}</div>
            </div>
            {/* Live indicator */}
            <div style={{display:"flex",alignItems:"center",gap:7,background:"rgba(255,255,255,0.06)",borderRadius:99,padding:"6px 14px",border:"1px solid rgba(255,255,255,0.1)"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:"#22C55E",boxShadow:"0 0 8px #22C55E",animation:"pulse 2s infinite"}}/>
              <span style={{fontSize:11,fontWeight:600,color:"#94A3B8"}}>LIVE</span>
            </div>
          </div>

          {/* Top KPI row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
            {[
              {label:"Active cases",  val:pending.length,   color:"#818CF8", icon:"⚡"},
              {label:"Total value",   val:"$"+Math.round(totalValue/1000)+"k", color:"#34D399", icon:"💰"},
              {label:"Completed",     val:completed.length, color:"#22C55E", icon:"✓"},
              {label:"Rejected",      val:rejected.length,  color:"#F87171", icon:"✗"},
            ].map(function(k){
              return (
                <div key={k.label} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"14px 16px",backdropFilter:"blur(10px)"}}>
                  <div style={{fontSize:20,marginBottom:4}}>{k.icon}</div>
                  <div style={{fontSize:26,fontWeight:800,color:k.color,lineHeight:1}}>{k.val}</div>
                  <div style={{fontSize:11,color:"#64748B",marginTop:4,fontWeight:500}}>{k.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .ov-card { animation: slideUp 0.4s ease both; }
      `}</style>

      {/* ── ROLE WORKLOAD RINGS ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        {ROLE_STATS.map(function(rs,i){
          var cnt=cases.filter(function(c){return rs.stages.includes(c.status);}).length;
          return (
            <div key={rs.role} className="ov-card" style={{animationDelay:(i*80)+"ms",background:"#fff",border:"2px solid "+rs.color+"22",borderRadius:14,padding:"16px 14px",display:"flex",alignItems:"center",gap:14,boxShadow:"0 2px 12px "+rs.color+"10"}}>
              <Donut count={cnt} total={Math.max(cases.length,1)} color={rs.color}/>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>{rs.role}</div>
                <div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{cnt} pending</div>
                <div style={{fontSize:10,color:rs.color,marginTop:4,fontWeight:600}}>{rs.stages.join(" · ")}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── PIPELINE FLOW ── */}
      <div style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:"18px 20px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>Pipeline flow</div>
          <div style={{fontSize:11,color:"#9CA3AF"}}>{pending.length} cases in motion</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {PIPELINE.filter(function(p){return p.s!=="Rejected"&&p.s!=="AML Review Pending"&&p.s!=="Returned to Requester";}).map(function(p,i){
            var cnt=stageCounts[p.s]||0;
            var maxC=Math.max.apply(null,PIPELINE.map(function(x){return stageCounts[x.s]||0;}).concat([1]));
            var pct=cnt/maxC*100;
            var isTerminal=p.s==="Completed";
            return (
              <div key={p.s} style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:160,flexShrink:0,display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:cnt>0?p.color:"#E5E7EB",flexShrink:0,boxShadow:cnt>0?"0 0 6px "+p.color:"none"}}/>
                  <div style={{fontSize:11,color:cnt>0?"#374151":"#9CA3AF",fontWeight:cnt>0?600:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.s}</div>
                </div>
                <div style={{flex:1,height:22,background:"#F8FAFC",borderRadius:6,overflow:"hidden",position:"relative"}}>
                  <div style={{
                    position:"absolute",left:0,top:0,bottom:0,
                    width:pct+"%",
                    background:cnt>0?"linear-gradient(90deg,"+p.color+"CC,"+p.color+")":"transparent",
                    borderRadius:6,
                    transition:"width 1s cubic-bezier(.4,0,.2,1)",
                    minWidth:cnt>0?6:0
                  }}/>
                  {cnt>0&&<div style={{position:"absolute",left:8,top:0,bottom:0,display:"flex",alignItems:"center",fontSize:10,fontWeight:700,color:"#fff",mixBlendMode:"normal",zIndex:1,textShadow:"0 1px 3px rgba(0,0,0,0.3)"}}>{cnt} case{cnt!==1?"s":""}</div>}
                </div>
                {p.role&&<div style={{fontSize:9,fontWeight:700,color:p.color,background:p.color+"12",borderRadius:99,padding:"2px 8px",flexShrink:0,whiteSpace:"nowrap"}}>{p.role}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── BOTTOM ROW: Recent activity + alerts ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>

        {/* Recent cases */}
        <div style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:"16px 18px"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#111827",marginBottom:12}}>Recent cases</div>
          {cases.slice(0,5).map(function(c,i){
            return (
              <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<4?"1px solid #F3F4F6":"none"}}>
                <div style={{width:32,height:32,borderRadius:8,background:(ROLE_COLOR[STAGE_ROLE[c.status]]||"#374151")+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:ROLE_COLOR[STAGE_ROLE[c.status]]||"#374151",flexShrink:0}}>
                  {c.clientName.split(" ").map(function(w){return w[0];}).join("").toUpperCase().slice(0,2)}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#111827",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.clientName}</div>
                  <div style={{fontSize:10,color:"#9CA3AF"}}>{c.cid} · {c.broker}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                  <span style={bs(c.status)}>{c.status}</span>
                  <div style={{fontSize:10,color:"#9CA3AF"}}>${Number(c.valueUSD).toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Alerts + flags */}
        <div style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:"16px 18px"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#111827",marginBottom:12}}>Flags & alerts</div>
          {(function(){
            var alerts=[];
            // Sanction stock flags
            cases.filter(function(c){return c.opsSanctionStock;}).forEach(function(c){
              alerts.push({type:"sanction",label:"Sanction stock flagged",sub:c.clientName+" · "+c.id,color:"#DC2626",bg:"#FEF2F2",icon:"⚠"});
            });
            // AML review pending
            cases.filter(function(c){return c.status==="AML Review Pending";}).forEach(function(c){
              alerts.push({type:"aml",label:"AML info requested",sub:c.clientName+" awaiting response",color:"#EA580C",bg:"#FFF7ED",icon:"🔍"});
            });
            // Returned to requester
            cases.filter(function(c){return c.status==="Returned to Requester";}).forEach(function(c){
              alerts.push({type:"return",label:"Returned to requester",sub:c.clientName+" needs to re-submit",color:"#92400E",bg:"#FFFBEB",icon:"↩"});
            });
            // CBO transfers
            cases.filter(function(c){return c.transferType==="CBO";}).forEach(function(c){
              alerts.push({type:"cbo",label:"CBO transfer — needs rejection",sub:c.clientName+" · "+c.id,color:"#7C3AED",bg:"#F5F3FF",icon:"🚫"});
            });
            // Checklist failures
            cases.filter(function(c){return c.cashOk===false||c.proofOwnership===false||c.w8Ok===false;}).forEach(function(c){
              alerts.push({type:"check",label:"Checklist items failed",sub:c.clientName+" · review required",color:"#DC2626",bg:"#FEF2F2",icon:"✗"});
            });
            if(alerts.length===0){
              return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:120,gap:8}}>
                <div style={{fontSize:28}}>✅</div>
                <div style={{fontSize:12,color:"#6B7280",fontWeight:600}}>All clear — no flags</div>
              </div>;
            }
            return alerts.slice(0,5).map(function(a,i){
              return (
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 10px",background:a.bg,borderRadius:8,marginBottom:7,border:"1px solid "+a.color+"22"}}>
                  <div style={{fontSize:16,flexShrink:0,marginTop:1}}>{a.icon}</div>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:a.color}}>{a.label}</div>
                    <div style={{fontSize:10,color:"#6B7280",marginTop:1}}>{a.sub}</div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}

function QueueTab(props) {
  var cases=props.cases; var setCases=props.setCases; var user=props.user; var permissions=props.permissions||[];
  var [viewRole,setViewRole]=useState(user.role==="Admin"?"Operations":user.role);
  var [sel,setSel]=useState(null);
  var [notifStatus,setNotifStatus]=useState(null); // "sending"|"sent"|"failed"
  var activeRole=user.role==="Admin"?viewRole:user.role;
  var qStages=ROLE_QUEUE_STAGES[activeRole]||[];
  var queue=cases.filter(function(c){return qStages.includes(c.status);});
  var activeCase=null;
  for(var i=0;i<cases.length;i++){if(cases[i].id===sel){activeCase=cases[i];break;}}
  var effectiveUser={id:user.id,name:user.name,email:user.email,role:activeRole};
  function advance(){
    var a=NEXT_ACTION[activeCase.status];
    if(!a)return;
    var patch={status:a.next};
    if(activeCase.status==="Returned to Requester"||activeCase.status==="AML Review Pending"){
      var isAML=activeCase.status==="AML Review Pending";
      var noteText=isAML?"Re-submitted to AML with requested information.":"Re-submitted to Operations after addressing the issues.";
      var note={role:"Requester",byName:user.name,text:noteText,date:new Date().toISOString().slice(0,10)};
      patch.notes=(activeCase.notes||[]).concat([note]);
    }
    var updatedCase=Object.assign({},activeCase,patch);
    setCases(function(prev){return patchCase(prev,activeCase.id,patch);});
    setSel(null);
    // Fire notification email (best-effort, non-blocking)
    setNotifStatus("sending");
    draftNotificationEmail(a.next,updatedCase,permissions,user.name)
      .then(function(){setNotifStatus("sent");setTimeout(function(){setNotifStatus(null);},4000);})
      .catch(function(){setNotifStatus("failed");setTimeout(function(){setNotifStatus(null);},4000);});
  }
  var color=ROLE_COLOR[activeRole]||"#374151";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Notification status toast */}
      {notifStatus&&(
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:9,fontSize:12,fontWeight:600,
          background:notifStatus==="sending"?"#EFF6FF":notifStatus==="sent"?"#F0FDF4":"#FEF2F2",
          border:"1px solid "+(notifStatus==="sending"?"#BFDBFE":notifStatus==="sent"?"#86EFAC":"#FCA5A5"),
          color:notifStatus==="sending"?"#1E40AF":notifStatus==="sent"?"#166534":"#991B1B"}}>
          <span>{notifStatus==="sending"?"📧 Drafting notification email…":notifStatus==="sent"?"✓ Notification email drafted in Gmail — ready to send":"⚠ Could not draft notification email"}</span>
        </div>
      )}
      {user.role==="Admin"&&(
        <RoleSwitcher viewRole={viewRole} setViewRole={function(r){setViewRole(r);setSel(null);}} cases={cases} mode="queue"/>
      )}
      <div style={{display:"flex",gap:14}}>
        <div style={{width:248,flexShrink:0,display:"flex",flexDirection:"column",gap:7}}>
          <div style={{fontSize:12,fontWeight:600,color:color,marginBottom:2}}>{queue.length} case{queue.length!==1?"s":""} pending - {activeRole}</div>
          {queue.length===0&&<div style={{fontSize:13,color:"#9CA3AF",textAlign:"center",padding:"30px 0"}}>Queue is clear</div>}
          {queue.map(function(c) {
            return (
              <div key={c.id} onClick={function(){setSel(sel===c.id?null:c.id);}} style={{border:"2px solid "+(sel===c.id?color:"#E5E7EB"),borderRadius:12,padding:11,cursor:"pointer",background:sel===c.id?color+"0D":"#fff"}}>
                <div style={{fontSize:9,color:"#9CA3AF",fontWeight:600}}>{c.id}</div>
                <div style={{fontSize:13,fontWeight:700,marginTop:2}}>{c.clientName}</div>
                <div style={{fontSize:11,color:"#6B7280"}}>{c.cid} - {c.country} - {c.opsClub||c.club}</div>
                <div style={{fontSize:11,color:"#6B7280",marginBottom:5}}>{c.broker} - ${Number(c.valueUSD).toLocaleString()}</div>
                <span style={bs(c.status)}>{c.status}</span>
              </div>
            );
          })}
        </div>
        {activeCase
          ?<CaseDetail c={activeCase} setCases={setCases} user={effectiveUser} onAdvance={advance} onReject={function(){setSel(null);}}/>
          :<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#9CA3AF",fontSize:13}}>Select a case from the queue</div>}
      </div>
    </div>
  );
}

function AllCasesTab(props) {
  var cases=props.cases; var setCases=props.setCases; var user=props.user; var permissions=props.permissions||[];
  var [viewRole,setViewRole]=useState(user.role==="Admin"?"Operations":user.role);
  var [filter,setFilter]=useState("All");
  var [search,setSearch]=useState("");
  var [sel,setSel]=useState(null);
  var [notifStatus,setNotifStatus]=useState(null);
  var activeRole=user.role==="Admin"?viewRole:user.role;
  var visibleStages=ROLE_VISIBLE_STAGES[activeRole]||STAGES;
  var filtered=cases.filter(function(c) {
    var stageOk=visibleStages.includes(c.status);
    var filterOk=filter==="All"||c.status===filter;
    var q=search.toLowerCase();
    var searchOk=!q||c.clientName.toLowerCase().includes(q)||c.cid.includes(q)||c.id.toLowerCase().includes(q);
    return stageOk&&filterOk&&searchOk;
  });
  var active=null;for(var i=0;i<cases.length;i++){if(cases[i].id===sel){active=cases[i];break;}}
  var effectiveUser={id:user.id,name:user.name,email:user.email,role:activeRole};
  function advance(){
    var a=NEXT_ACTION[active.status];if(!a)return;
    var patch={status:a.next};
    if(active.status==="Returned to Requester"||active.status==="AML Review Pending"){
      var isAML=active.status==="AML Review Pending";
      var noteText=isAML?"Re-submitted to AML with requested information.":"Re-submitted to Operations after addressing the issues.";
      var note={role:"Requester",byName:user.name,text:noteText,date:new Date().toISOString().slice(0,10)};
      patch.notes=(active.notes||[]).concat([note]);
    }
    var updatedCase=Object.assign({},active,patch);
    setCases(function(prev){return patchCase(prev,active.id,patch);});
    setNotifStatus("sending");
    draftNotificationEmail(a.next,updatedCase,permissions,user.name)
      .then(function(){setNotifStatus("sent");setTimeout(function(){setNotifStatus(null);},4000);})
      .catch(function(){setNotifStatus("failed");setTimeout(function(){setNotifStatus(null);},4000);});
  }
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {notifStatus&&(
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:9,fontSize:12,fontWeight:600,
          background:notifStatus==="sending"?"#EFF6FF":notifStatus==="sent"?"#F0FDF4":"#FEF2F2",
          border:"1px solid "+(notifStatus==="sending"?"#BFDBFE":notifStatus==="sent"?"#86EFAC":"#FCA5A5"),
          color:notifStatus==="sending"?"#1E40AF":notifStatus==="sent"?"#166534":"#991B1B"}}>
          <span>{notifStatus==="sending"?"📧 Drafting notification email…":notifStatus==="sent"?"✓ Notification email drafted in Gmail — ready to send":"⚠ Could not draft notification email"}</span>
        </div>
      )}
      {user.role==="Admin"&&(
        <RoleSwitcher viewRole={viewRole} setViewRole={function(r){setViewRole(r);setSel(null);setFilter("All");}} cases={cases} mode="cases"/>
      )}
      <div style={{display:"flex",gap:14}}>
        <div style={{width:255,flexShrink:0}}>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
            <input style={{fontSize:12,border:"1px solid #E5E7EB",borderRadius:8,padding:"6px 9px"}} placeholder="Search..." value={search} onChange={function(e){setSearch(e.target.value);}}/>
            <select style={{fontSize:12,border:"1px solid #E5E7EB",borderRadius:8,padding:"6px 8px",background:"#fff"}} value={filter} onChange={function(e){setFilter(e.target.value);}}>
              <option>All</option>
              {visibleStages.map(function(s){return <option key={s}>{s}</option>;})}
            </select>
          </div>
          <div style={{fontSize:10,color:"#9CA3AF",marginBottom:5}}>{filtered.length} case{filtered.length!==1?"s":""} visible to {activeRole}</div>
          {filtered.map(function(c) {
            return (
              <div key={c.id} onClick={function(){setSel(sel===c.id?null:c.id);}} style={{border:"2px solid "+(sel===c.id?"#6366F1":"#E5E7EB"),borderRadius:10,padding:"9px 11px",marginBottom:5,cursor:"pointer",background:sel===c.id?"#EEF2FF":"#fff"}}>
                <div style={{fontSize:9,color:"#9CA3AF",fontWeight:600}}>{c.id}</div>
                <div style={{fontSize:13,fontWeight:600}}>{c.clientName}</div>
                <div style={{fontSize:11,color:"#6B7280"}}>{c.cid} - {c.broker}</div>
                <div style={{marginTop:4}}><span style={bs(c.status)}>{c.status}</span></div>
              </div>
            );
          })}
        </div>
        {active
          ?<CaseDetail c={active} setCases={setCases} user={effectiveUser} onAdvance={advance} onReject={function(){setSel(null);}}/>
          :<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#9CA3AF",fontSize:13}}>Select a case</div>}
      </div>
    </div>
  );
}


function NewRequestTab(props) {
  var cases=props.cases; var setCases=props.setCases; var user=props.user;
  var empty={
    clientName:"",cid:"",country:"",reason:"",valueUSD:"",transferType:"NCBO",
    broker:"",brokerEmail:"",requesterAccountName:"",requesterAccountNumber:"",
    formFile:"",proofFile:"",
    assets:[],instruments:"",
    formSigned:null   // null=unknown, true=signed, false=unsigned
  };
  var [form,setForm]=useState(empty);
  var [parsing,setParsing]=useState(false);
  var [autofilled,setAutofilled]=useState({});
  var [parseFields,setParseFields]=useState([]);
  var [feeAware,setFeeAware]=useState(false);
  var [feeError,setFeeError]=useState(false);
  var [sigError,setSigError]=useState(false);
  var [submitted,setSubmitted]=useState(false);

  function setField(name,val){setForm(function(f){var n=cloneObj(f);n[name]=val;return n;});}

  function inp(label,key,type,placeholder){
    var isAuto=!!autofilled[key];
    return (
      <div key={key}>
        <label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:3}}>{label}</label>
        <input
          type={type||"text"}
          style={{width:"100%",border:"1px solid "+(isAuto?"#86EFAC":"#E5E7EB"),borderRadius:8,padding:"7px 9px",fontSize:12,boxSizing:"border-box",background:isAuto?"#F0FDF4":"#fff"}}
          value={form[key]}
          onChange={function(e){setField(key,e.target.value);setAutofilled(function(a){var n=cloneObj(a);n[key]=false;return n;});}}
          placeholder={placeholder||label}
        />
      </div>
    );
  }

  async function handlePDF(file) {
    if(!file)return;
    setField("formFile",file.name);
    setParsing(true);

    // Load PDF.js if not already loaded
    if(!window["pdfjs-dist/build/pdf"]){
      await new Promise(function(res){
        var s=document.createElement("script");
        s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        s.onload=function(){
          window["pdfjs-dist/build/pdf"]=window.pdfjsLib;
          window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          res();
        };
        document.head.appendChild(s);
      });
    }

    var arrayBuffer=await new Promise(function(resolve){
      var r=new FileReader();
      r.onload=function(e){resolve(e.target.result);};
      r.readAsArrayBuffer(file);
    });

    try{
      var lib=window["pdfjs-dist/build/pdf"];
      var pdf=await lib.getDocument({data:arrayBuffer}).promise;

      // ── STEP 1: Read form fields via annotations (this is where filled values live) ──
      var fields={};
      for(var pi=1;pi<=pdf.numPages;pi++){
        var pg=await pdf.getPage(pi);
        var annots=await pg.getAnnotations();
        annots.forEach(function(a){
          // AcroForm text fields have fieldName + fieldValue
          if(a.fieldName&&a.fieldValue!==undefined&&a.fieldValue!==null){
            fields[a.fieldName]=a.fieldValue;
          }
          // Radio/checkbox buttons — check if selected
          if(a.fieldName&&a.fieldType==="Btn"&&a.buttonValue){
            fields[a.fieldName+"__btn"]=a.buttonValue;
          }
          // Signature field
          if(a.subtype==="Widget"&&a.fieldType==="Sig"){
            fields["__signature__"]=a.fieldValue||a.data||null;
          }
        });
      }

      var filled=[]; var patch={}; var af={};

      // ── Client Information (Page 1) ──
      // Text1 = Name (Ian Mason)
      var clientName=(fields["Text1"]||"").trim();
      if(clientName){patch.clientName=clientName;af.clientName=true;filled.push("Client name");}

      // Text4 = Transfer Reason
      var reason=(fields["Text4"]||"").trim();
      if(reason){patch.reason=reason;af.reason=true;filled.push("Reason");}

      // Text5 = Approximate Market Value  ($ 136, 845 → 136845)
      var rawVal=(fields["Text5"]||"").replace(/[\$,\s]/g,"").trim();
      if(rawVal&&!isNaN(Number(rawVal))){patch.valueUSD=rawVal;af.valueUSD=true;filled.push("Value");}

      // Transfer type — Group1 radio button
      // /Choice1 = CBO selected, /Choice2 = NCBO selected
      var radioVal=(fields["Group1"]||fields["Group1__btn"]||"").toString();
      var transferType=radioVal.includes("Choice1")?"CBO":"NCBO";
      patch.transferType=transferType;
      af.transferType=true;
      filled.push("Transfer type ("+transferType+")");

      // ── Receiving Bank Information (Page 1) ──
      // Text8 = Bank Name (Interactive Brokers Ireland Limited)
      var broker=(fields["Text8"]||"").trim();
      if(broker){patch.broker=broker;af.broker=true;filled.push("Broker name");}

      // Text10 = Email (fop-transfer-in@interactivebrokers.com)
      var brokerEmail=(fields["Text10"]||"").trim();
      if(brokerEmail){patch.brokerEmail=brokerEmail;af.brokerEmail=true;filled.push("Broker email");}

      // Text6 = Account Name (Ian J Mason)
      var accName=(fields["Text6"]||"").trim();
      if(accName){patch.requesterAccountName=accName;af.requesterAccountName=true;filled.push("Account name");}

      // Text7 = Account Number (U11610846)
      var accNum=(fields["Text7"]||"").trim();
      if(accNum){patch.requesterAccountNumber=accNum;af.requesterAccountNumber=true;filled.push("Account number");}

      // ── Assets Table (Page 2) ──
      // Fields: 100,101,102... = Symbol row 1,2,3...
      //         120,121,122... = Security Name row 1,2,3...
      //         150,151,152... = Shares Quantity row 1,2,3...
      //         170,171,172... = Exchange row 1,2,3...
      var assets=[];
      for(var row=0;row<15;row++){
        var sym=(fields[String(100+row)]||"").trim();
        var name=(fields[String(120+row)]||"").trim();
        var qty=(fields[String(150+row)]||"").trim();
        var exch=(fields[String(170+row)]||"").trim();
        if(sym&&name&&qty){
          assets.push({symbol:sym,name:name,qty:qty,exchange:exch||"—"});
        }
      }
      if(assets.length){
        patch.instruments=assets.length;
        patch.assets=assets;
        filled.push(assets.length+" asset(s) detected");
      }

      // ── Signature detection ──
      // The sig field has /AP /N appearance stream when signed (4291 bytes in sample)
      // PDF.js exposes this as `hasAppearance: true` on the annotation object.
      // We scan ALL pages for a Widget annotation with fieldType "Sig".
      // hasAppearance=true  → visual signature drawn → SIGNED
      // hasAppearance=false/missing → field present but empty → NOT SIGNED
      var hasSig=false;
      var sigFieldFound=false;
      for(var spi=1;spi<=pdf.numPages;spi++){
        var spg=await pdf.getPage(spi);
        // Use default (no intent) so we get the raw widget data including hasAppearance
        var spannots=await spg.getAnnotations();
        for(var ai=0;ai<spannots.length;ai++){
          var a=spannots[ai];
          // Match by fieldType Sig OR by fieldName containing "Sig"/"sign"
          var isSigField=(a.fieldType==="Sig")||(a.fieldName&&/sig/i.test(a.fieldName));
          if(isSigField){
            sigFieldFound=true;
            // hasAppearance is true when the /AP /N stream has real content
            if(a.hasAppearance===true){hasSig=true;}
            // Also check fieldValue — a cryptographically signed PDF sets this
            if(a.fieldValue&&typeof a.fieldValue==="object"&&Object.keys(a.fieldValue).length>0){hasSig=true;}
            if(a.fieldValue&&typeof a.fieldValue==="string"&&a.fieldValue.trim().length>0){hasSig=true;}
          }
        }
      }
      // If no sig field found at all, treat as unknown (null) rather than false
      patch.formSigned = sigFieldFound ? hasSig : null;
      filled.push(
        !sigFieldFound ? "⚠ Signature field not found" :
        hasSig        ? "✓ Signature detected" :
                        "⚠ Signature not detected"
      );

      setForm(function(f){var n=cloneObj(f);Object.keys(patch).forEach(function(k){n[k]=patch[k];});return n;});
      setAutofilled(af);
      setParseFields(filled);
    }catch(err){
      console.error("PDF parse error:",err);
      setParseFields(["⚠ Could not read PDF — please fill fields manually"]);
    }
    setParsing(false);
  }

  function submit() {
    if(!form.clientName||!form.cid||!form.broker)return;
    if(!form.formFile)return;
    if(form.formSigned===false){setSigError(true);return;}
    if(!feeAware){setFeeError(true);return;}
    var numInstr=form.assets&&form.assets.length>0?form.assets.length:(Number(form.instruments)||1);
    var nc=mkCase(
      "ACAT-2025-0"+(50+cases.length),
      form.cid,form.clientName,form.country,form.broker,
      numInstr,Number(form.valueUSD)||0,
      "Submitted",user.email,user.name,
      new Date().toISOString().slice(0,10),"Standard",
      {
        reason:form.reason,transferType:form.transferType,
        brokerEmail:form.brokerEmail,
        requesterAccountName:form.requesterAccountName,
        requesterAccountNumber:form.requesterAccountNumber,
        formAssets:form.assets,
        formSigned:form.formSigned,
        documents:[]
        // opsReference and compensationNote auto-generated by mkCase via nextRef()
      }
    );
    if(form.formFile)nc.documents.push({name:form.formFile,label:"Securities Out Form",by:user.name,date:new Date().toISOString().slice(0,10)});
    if(form.proofFile)nc.documents.push({name:form.proofFile,label:"Proof of Ownership",by:user.name,date:new Date().toISOString().slice(0,10)});
    setCases(function(p){return [nc].concat(p);});
    setSubmitted(true);
    setForm(empty);setFeeAware(false);setAutofilled({});setParseFields([]);setSigError(false);
    setTimeout(function(){setSubmitted(false);},4000);
  }

  var numAssets=form.assets&&form.assets.length>0?form.assets.length:(Number(form.instruments)||0);
  var totalFee=numAssets*100;
  var sigOk=form.formSigned!==false;   // null (not parsed yet) = allow; false = block
  var canSubmit=form.clientName&&form.cid&&form.broker&&form.formFile&&feeAware&&sigOk;

  // Step header helper
  function StepHeader(sprops){
    var n=sprops.n; var label=sprops.label; var color=sprops.color;
    return (
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{width:26,height:26,borderRadius:"50%",background:color,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>{n}</div>
        <div style={{fontSize:13,fontWeight:700,color:color}}>{label}</div>
        {sprops.badge&&<span style={{marginLeft:"auto",fontSize:10,fontWeight:700,background:color+"18",color:color,borderRadius:99,padding:"2px 10px"}}>{sprops.badge}</span>}
      </div>
    );
  }

  return (
    <div style={{maxWidth:640,display:"flex",flexDirection:"column",gap:14}}>

      {submitted&&<div style={{background:"#F0FDF4",border:"1px solid #86EFAC",color:"#166534",fontSize:13,padding:"12px 16px",borderRadius:10,fontWeight:600}}>
        ✓ Request submitted and is now in the Operations queue.
      </div>}

      {/* ── STEP 1 — Documents  (Indigo) ── */}
      <div style={{border:"2px solid #C7D2FE",borderRadius:14,padding:18,background:"#F8FAFF"}}>
        <StepHeader n={1} label="Upload documents" color="#4338CA" badge="Required"/>
        <div style={{fontSize:11,color:"#6B7280",marginBottom:14}}>Upload both documents. The Securities Out Form (PDF) will be auto-read to pre-fill all steps below.</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>

          {/* Form PDF */}
          <div>
            <div style={{fontSize:11,fontWeight:600,color:"#4338CA",marginBottom:6}}>Securities Out Form (PDF) <span style={{color:"#DC2626"}}>*</span></div>
            <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"2px dashed "+(form.formFile?(form.formSigned===false?"#FCA5A5":form.formSigned===true?"#16A34A":"#6366F1"):"#6366F1"),borderRadius:10,padding:"16px 12px",cursor:"pointer",background:form.formFile?(form.formSigned===false?"#FEF2F2":form.formSigned===true?"#F0FDF4":"#EEF2FF"):"#EEF2FF",gap:5,minHeight:88,textAlign:"center"}}>
              {parsing&&<><span style={{fontSize:22}}>⏳</span><span style={{fontSize:11,color:"#6366F1",fontWeight:600}}>Reading PDF…</span><span style={{fontSize:10,color:"#9CA3AF"}}>Extracting all fields</span></>}
              {!parsing&&form.formFile&&form.formSigned===true&&<><span style={{fontSize:22}}>✅</span><span style={{fontSize:10,color:"#16A34A",fontWeight:700,wordBreak:"break-all"}}>{form.formFile}</span><span style={{fontSize:10,color:"#16A34A",fontWeight:600}}>✓ Signed · Click to replace</span></>}
              {!parsing&&form.formFile&&form.formSigned===false&&<><span style={{fontSize:22}}>⚠️</span><span style={{fontSize:10,color:"#DC2626",fontWeight:700,wordBreak:"break-all"}}>{form.formFile}</span><span style={{fontSize:10,color:"#DC2626",fontWeight:600}}>✗ Signature missing</span></>}
              {!parsing&&form.formFile&&form.formSigned===null&&<><span style={{fontSize:22}}>📄</span><span style={{fontSize:10,color:"#6366F1",fontWeight:700,wordBreak:"break-all"}}>{form.formFile}</span><span style={{fontSize:10,color:"#9CA3AF"}}>Sig status unknown · Click to replace</span></>}
              {!parsing&&!form.formFile&&<><span style={{fontSize:22}}>📄</span><span style={{fontSize:11,color:"#6366F1",fontWeight:700}}>Upload PDF form</span><span style={{fontSize:10,color:"#9CA3AF"}}>Auto-fills all steps below</span></>}
              <input type="file" accept=".pdf" style={{display:"none"}} onChange={function(e){if(e.target.files[0])handlePDF(e.target.files[0]);}}/>
            </label>
            <div style={{marginTop:6,fontSize:10}}><a href="https://drive.google.com/drive/folders/1Bj4ArDrAj7ZUX6Ik-pyMOvmbZODxhanD" target="_blank" rel="noreferrer" style={{color:"#4338CA"}}>↗ Download blank form from Google Drive</a></div>
          </div>

          {/* Proof of Ownership */}
          <div>
            <div style={{fontSize:11,fontWeight:600,color:"#4338CA",marginBottom:6}}>Proof of Ownership <span style={{color:"#DC2626"}}>*</span></div>
            <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"2px dashed "+(form.proofFile?"#16A34A":"#C7D2FE"),borderRadius:10,padding:"16px 12px",cursor:"pointer",background:form.proofFile?"#F0FDF4":"#EEF2FF",gap:5,minHeight:88,textAlign:"center"}}>
              {form.proofFile
                ?<><span style={{fontSize:22}}>✅</span><span style={{fontSize:10,color:"#16A34A",fontWeight:700,wordBreak:"break-all"}}>{form.proofFile}</span><span style={{fontSize:10,color:"#16A34A"}}>Click to replace</span></>
                :<><span style={{fontSize:22}}>📎</span><span style={{fontSize:11,color:"#4338CA",fontWeight:700}}>Upload proof</span><span style={{fontSize:10,color:"#9CA3AF"}}>Screenshot, PDF, or image</span></>}
              <input type="file" accept="*" style={{display:"none"}} onChange={function(e){if(e.target.files[0])setField("proofFile",e.target.files[0].name);}}/>
            </label>
          </div>
        </div>

        {/* Auto-fill summary + signature status */}
        {parseFields.length>0&&(
          <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:8}}>

            {/* Signature status — prominent row */}
            {form.formSigned===true&&(
              <div style={{display:"flex",alignItems:"center",gap:10,background:"#DCFCE7",border:"1px solid #86EFAC",borderRadius:8,padding:"10px 14px"}}>
                <span style={{fontSize:18}}>✅</span>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"#166534"}}>Form is signed</div>
                  <div style={{fontSize:11,color:"#166534",opacity:0.8}}>Client signature detected on page 2 — form is valid for submission.</div>
                </div>
              </div>
            )}
            {form.formSigned===false&&(
              <div style={{display:"flex",alignItems:"center",gap:10,background:"#FEF2F2",border:"2px solid #FCA5A5",borderRadius:8,padding:"10px 14px"}}>
                <span style={{fontSize:18}}>⚠️</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#991B1B"}}>Signature missing — cannot submit</div>
                  <div style={{fontSize:11,color:"#B91C1C",marginTop:1}}>No client signature found on the uploaded form. Request the client to sign page 2, then re-upload.</div>
                </div>
              </div>
            )}
            {form.formSigned===null&&parseFields.some(function(f){return f.includes("not found");})&&(
              <div style={{display:"flex",alignItems:"center",gap:10,background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:8,padding:"10px 14px"}}>
                <span style={{fontSize:18}}>❓</span>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"#92400E"}}>Signature field not detected in this PDF</div>
                  <div style={{fontSize:11,color:"#78350F",marginTop:1}}>Use the manual confirmation below if you have visually verified the form is signed.</div>
                </div>
              </div>
            )}

            {/* Fields extracted banner */}
            <div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#166534"}}>
              ✓ Auto-filled from PDF: <strong>{parseFields.filter(function(f){return !f.includes("Signature")&&!f.includes("signature");}).join(", ")}</strong>
            </div>
          </div>
        )}

        {/* Manual signature override when not detected */}
        {form.formSigned===false&&(
          <div style={{marginTop:8,background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,padding:"10px 14px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#92400E",marginBottom:6}}>Manual override</div>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:11,color:"#78350F"}}>
              <input type="checkbox" onChange={function(e){if(e.target.checked){setField("formSigned",true);setSigError(false);}else{setField("formSigned",false);}}} style={{width:14,height:14,flexShrink:0}}/>
              I have visually confirmed the client has signed page 2 of this form
            </label>
          </div>
        )}
      </div>

      {/* ── STEP 2 — Client information  (Teal) ── */}
      <div style={{border:"2px solid #99F6E4",borderRadius:14,padding:18,background:"#F0FDFA"}}>
        <StepHeader n={2} label="Client information" color="#0D9488" badge="Form page 1"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {inp("Full client name","clientName","text","e.g. Ian Mason")}
          {inp("Client CID","cid","text","e.g. 45061")}
          {inp("Country","country","text","e.g. IE")}
          {inp("Transfer reason","reason","text","e.g. Consolidating accounts")}
          {inp("Approximate market value (USD)","valueUSD","number","e.g. 136845")}
          <div>
            <label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:3}}>Transfer type</label>
            <div style={{display:"flex",gap:8}}>
              {["NCBO","CBO"].map(function(t){
                var isSelected=form.transferType===t;
                var isAuto=!!autofilled.transferType&&isSelected;
                var isCBO=t==="CBO";
                return (
                  <button key={t} onClick={function(){setField("transferType",t);setAutofilled(function(a){var n=cloneObj(a);n.transferType=false;return n;});}}
                    style={{flex:1,padding:"8px 0",borderRadius:8,border:"2px solid "+(isSelected?(isCBO?"#DC2626":"#0D9488"):"#E5E7EB"),
                      background:isSelected?(isCBO?"#FEF2F2":"#F0FDF4"):"#fff",
                      color:isSelected?(isCBO?"#DC2626":"#0D9488"):"#6B7280",
                      fontWeight:800,fontSize:12,cursor:"pointer",
                      outline:isAuto?"2px solid #86EFAC":"none",outlineOffset:2}}>
                    {t}
                    {isCBO&&isSelected&&<div style={{fontSize:9,color:"#DC2626",fontWeight:600,marginTop:1}}>⚠ not accepted</div>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {/* CBO warning banner */}
        {form.transferType==="CBO"&&(
          <div style={{marginTop:12,background:"#FEF2F2",border:"2px solid #FCA5A5",borderRadius:10,padding:"10px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{fontSize:18,flexShrink:0}}>🚫</span>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:"#991B1B",marginBottom:2}}>CBO transfers are not accepted</div>
              <div style={{fontSize:11,color:"#B91C1C",lineHeight:1.5}}>Only NCBO (No Change of Beneficial Owner) transfers are processed. Please confirm with the client that the receiving account is in their own name, then switch to NCBO.</div>
            </div>
          </div>
        )}
      </div>

      {/* ── STEP 3 — Receiving bank / broker  (Blue) ── */}
      <div style={{border:"2px solid #BFDBFE",borderRadius:14,padding:18,background:"#EFF6FF"}}>
        <StepHeader n={3} label="Receiving bank / broker information" color="#2563EB" badge="Form page 1"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {inp("Bank / broker name","broker","text","e.g. Interactive Brokers Ireland")}
          {inp("Bank / broker email","brokerEmail","email","e.g. fop-transfer-in@broker.com")}
          {inp("Requester account name","requesterAccountName","text","e.g. Ian J Mason")}
          {inp("Requester account number","requesterAccountNumber","text","e.g. U11610846")}
        </div>
      </div>

      {/* ── STEP 4 — Assets  (Green) ── */}
      <div style={{border:"2px solid #86EFAC",borderRadius:14,padding:18,background:"#F0FDF4"}}>
        <StepHeader n={4} label="Assets to transfer" color="#16A34A" badge="Form page 2"/>
        {form.assets&&form.assets.length>0?(
          <div>
            <div style={{fontSize:11,color:"#166534",marginBottom:10}}>
              {form.assets.length} asset{form.assets.length!==1?"s":""} auto-populated from the PDF. Review before submitting.
            </div>
            <div style={{border:"1px solid #86EFAC",borderRadius:10,overflow:"hidden"}}>
              <table style={{borderCollapse:"collapse",width:"100%",fontSize:12}}>
                <thead>
                  <tr style={{background:"#DCFCE7"}}>
                    {["#","Symbol","Security name","Shares quantity","Exchange"].map(function(h){return <th key={h} style={{padding:"7px 12px",textAlign:"left",fontWeight:700,color:"#166534",borderBottom:"1px solid #86EFAC"}}>{h}</th>;})}
                  </tr>
                </thead>
                <tbody>
                  {form.assets.map(function(a,i){return(
                    <tr key={i} style={{background:i%2?"#F0FDF4":"#fff",borderBottom:"1px solid #DCFCE7"}}>
                      <td style={{padding:"7px 12px",color:"#9CA3AF",fontSize:11}}>{i+1}</td>
                      <td style={{padding:"7px 12px",fontWeight:800,fontFamily:"monospace",color:"#15803D",fontSize:13}}>{a.symbol}</td>
                      <td style={{padding:"7px 12px",fontWeight:600,color:"#111827"}}>{a.name}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",fontWeight:700,color:"#1D4ED8",fontSize:13}}>{a.qty}</td>
                      <td style={{padding:"7px 12px",color:"#6B7280"}}>{a.exchange}</td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
            <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center",padding:"9px 14px",background:"#DCFCE7",borderRadius:8}}>
              <span style={{fontSize:12,color:"#166534",fontWeight:600}}>{form.assets.length} asset{form.assets.length!==1?"s":""}</span>
              <span style={{fontSize:11,color:"#166534",opacity:0.7}}>·</span>
              <span style={{fontSize:11,color:"#166534"}}>Total fee:</span>
              <span style={{fontSize:18,fontWeight:800,color:"#15803D"}}>${totalFee}</span>
              <span style={{fontSize:11,color:"#166534",opacity:0.7}}>({form.assets.length} × $100)</span>
            </div>
          </div>
        ):(
          <div style={{border:"2px dashed #86EFAC",borderRadius:10,padding:"28px 20px",textAlign:"center"}}>
            <div style={{fontSize:22,marginBottom:8}}>📋</div>
            <div style={{fontSize:13,fontWeight:600,color:"#166534",marginBottom:4}}>Assets will appear here automatically</div>
            <div style={{fontSize:11,color:"#6B7280"}}>Upload the Securities Out Form in Step 1 to auto-populate this table from page 2 of the form.</div>
          </div>
        )}
      </div>

      {/* ── STEP 5 — Fee acknowledgement  (Amber) ── */}
      <div style={{border:"2px solid "+(feeError?"#FCA5A5":feeAware?"#86EFAC":"#FDE68A"),borderRadius:14,padding:18,background:feeError?"#FEF2F2":feeAware?"#F0FDF4":"#FFFBEB"}}>
        <StepHeader n={5} label="Fee acknowledgement" color={feeError?"#DC2626":feeAware?"#166534":"#92400E"}/>
        <div style={{fontSize:12,color:"#78350F",marginBottom:12,lineHeight:1.6}}>
          eToro charges <strong>$100 per asset instrument</strong>. You must confirm the client has been informed of the total fee before submitting.
        </div>
        {numAssets>0?(
          <div style={{background:feeAware?"#DCFCE7":"#FEF3C7",border:"1px solid "+(feeAware?"#86EFAC":"#FDE68A"),borderRadius:10,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
            <div style={{fontSize:26,fontWeight:800,color:feeAware?"#166534":"#92400E"}}>${totalFee}</div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:feeAware?"#166534":"#92400E"}}>{numAssets} asset{numAssets!==1?"s":""} × $100 per instrument</div>
              {form.assets&&form.assets.length>0&&<div style={{fontSize:11,color:feeAware?"#166534":"#92400E",marginTop:3,opacity:0.8}}>{form.assets.map(function(a){return a.symbol;}).join("  ·  ")}</div>}
            </div>
          </div>
        ):(
          <div style={{background:"#FEF3C7",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:"#92400E"}}>
            Upload the Securities Out Form to calculate fees automatically from the assets table.
          </div>
        )}
        <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",padding:"12px 14px",background:feeAware?"#F0FDF4":"#fff",borderRadius:10,border:"2px solid "+(feeAware?"#86EFAC":"#E5E7EB")}}>
          <input type="checkbox" checked={feeAware} onChange={function(e){setFeeAware(e.target.checked);setFeeError(false);}} style={{marginTop:1,width:16,height:16,cursor:"pointer",flexShrink:0}}/>
          <span style={{fontSize:12,lineHeight:1.6,color:"#374151"}}>
            I confirm I have <strong>informed the client</strong> of the total fee of{" "}
            <strong style={{color:feeAware?"#166534":"#92400E"}}>${totalFee>0?totalFee:"..."}</strong>{" "}
            ({numAssets} asset{numAssets!==1?"s":""} × $100) before submitting this request.
          </span>
        </label>
        {feeError&&<div style={{fontSize:11,color:"#DC2626",marginTop:8,fontWeight:600}}>⚠ Confirm the fee acknowledgement before submitting.</div>}
      </div>

      {/* Submit */}
      {sigError&&(
        <div style={{background:"#FEF2F2",border:"2px solid #FCA5A5",borderRadius:10,padding:"12px 16px",display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:20}}>⚠️</span>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#991B1B"}}>Signature missing — cannot submit</div>
            <div style={{fontSize:11,color:"#B91C1C",marginTop:2}}>The form must be signed by the client. Go back to Step 1 and use the manual override if the signature was not detected.</div>
          </div>
        </div>
      )}
      <button
        onClick={submit}
        style={{background:canSubmit?"#111827":"#D1D5DB",color:"#fff",fontSize:14,fontWeight:700,border:"none",borderRadius:12,padding:"14px",cursor:canSubmit?"pointer":"default",letterSpacing:0.2}}>
        Submit request →
      </button>
      {!form.formFile&&<div style={{fontSize:11,color:"#9CA3AF",textAlign:"center",marginTop:-6}}>Upload the Securities Out Form (Step 1) to enable submission.</div>}
      {form.formFile&&form.formSigned===false&&!sigError&&<div style={{fontSize:11,color:"#DC2626",textAlign:"center",marginTop:-6,fontWeight:600}}>⚠ Signature not detected — use the manual override in Step 1.</div>}
      {form.formFile&&sigOk&&!feeAware&&<div style={{fontSize:11,color:"#92400E",textAlign:"center",marginTop:-6}}>Confirm fee acknowledgement in Step 5 to enable submission.</div>}
    </div>
  );
}

function MyRequestsTab(props) {
  var cases=props.cases; var setCases=props.setCases; var user=props.user;
  var mine=cases.filter(function(c){return c.submittedBy===user.email||c.submittedBy===user.id;});
  var returned=mine.filter(function(c){return c.status==="Returned to Requester"||c.status==="AML Review Pending";});

  function resubmit(c){
    var isAML=c.status==="AML Review Pending";
    var nextStatus=isAML?"Pending AML":"Submitted";
    var noteText=isAML
      ?"Re-submitted to AML with requested information."
      :"Re-submitted to Operations after addressing the issues.";
    var note={role:"Requester",byName:user.name,text:noteText,date:new Date().toISOString().slice(0,10)};
    setCases(function(prev){return patchCase(prev,c.id,{status:nextStatus,notes:c.notes.concat([note])});});
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:12,color:"#6B7280"}}>{mine.length} request{mine.length!==1?"s":""} submitted by you</div>

      {/* Prominent banner for returned cases */}
      {returned.length>0&&(
        <div style={{background:"#FFF7ED",border:"2px solid #FED7AA",borderRadius:12,padding:14}}>
          <div style={{fontSize:13,fontWeight:700,color:"#92400E",marginBottom:8}}>
            ↩ {returned.length} request{returned.length!==1?"s":""} require your attention
          </div>
          {returned.map(function(c){
            var isAML=c.status==="AML Review Pending";
            var notePrefix=isAML?"AML review pending:":"Returned to requester:";
            var returnNote=c.notes.slice().reverse().find(function(n){return n.text.startsWith(notePrefix);});
            return (
              <div key={c.id} style={{background:"#fff",border:"1px solid #FED7AA",borderRadius:9,padding:12,marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                  <div>
                    <div style={{fontSize:11,color:"#9CA3AF"}}>{c.id}</div>
                    <div style={{fontSize:14,fontWeight:700,color:"#111827"}}>{c.clientName}</div>
                    <div style={{fontSize:11,color:"#6B7280"}}>{c.cid} · {c.broker}</div>
                  </div>
                  <button onClick={function(){resubmit(c);}}
                    style={{background:"#EA580C",color:"#fff",fontSize:12,fontWeight:700,border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                    ↑ Re-submit to {c.status==="AML Review Pending"?"AML":"Operations"}
                  </button>
                </div>
                {returnNote&&(
                  <div style={{marginTop:10,background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:7,padding:"8px 11px",fontSize:11,color:"#78350F",lineHeight:1.6}}>
                    <div style={{fontWeight:700,marginBottom:3}}>Reason from Operations:</div>
                    <div style={{whiteSpace:"pre-line"}}>{returnNote.text.replace("Returned to requester:","").trim()}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {mine.length===0&&<div style={{border:"1px dashed #E5E7EB",borderRadius:12,padding:40,textAlign:"center",color:"#9CA3AF",fontSize:13}}>No requests yet</div>}
      {mine.map(function(c) {
        var isReturned=c.status==="Returned to Requester"||c.status==="AML Review Pending";
        return (
          <div key={c.id} style={{border:"2px solid "+(isReturned?"#FED7AA":"#E5E7EB"),borderRadius:12,padding:14,background:"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{fontSize:10,color:"#9CA3AF"}}>{c.id} · {c.ticketRef}</div>
                <div style={{fontSize:15,fontWeight:700,color:"#111827",marginTop:1}}>{c.clientName}</div>
                <div style={{fontSize:12,color:"#6B7280"}}>{c.cid} · {c.broker} · ${Number(c.valueUSD).toLocaleString()}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                <span style={bs(c.status)}>{c.status}</span>
                {isReturned&&(
                  <button onClick={function(){resubmit(c);}}
                    style={{background:"#EA580C",color:"#fff",fontSize:11,fontWeight:700,border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",whiteSpace:"nowrap"}}>
                    ↑ Re-submit to {c.status==="AML Review Pending"?"AML":"Operations"}
                  </button>
                )}
              </div>
            </div>
            <ProgressTracker status={c.status}/>
            {c.notes.length>0&&(
              <div style={{marginTop:10,borderTop:"1px solid #F3F4F6",paddingTop:9}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:5}}>Updates from the team</div>
                {c.notes.map(function(n,i) {
                  return (
                    <div key={i} style={{borderLeft:"3px solid "+(ROLE_COLOR[n.role]||"#D1D5DB"),paddingLeft:9,marginBottom:7}}>
                      <div style={{fontSize:10,color:"#9CA3AF"}}>{n.byName} ({n.role}) · {n.date}</div>
                      <div style={{fontSize:12,marginTop:1}}>{n.text}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{marginTop:10}}><DocStrip caseData={c} setCases={setCases} user={user}/></div>
          </div>
        );
      })}
    </div>
  );
}

function CopyBlock(props) {
  var label=props.label; var text=props.text;
  var [copied,setCopied]=useState(false);
  function doCopy() {
    var ta=document.createElement("textarea"); ta.value=text;
    ta.style.position="fixed"; ta.style.opacity="0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    try{document.execCommand("copy");setCopied(true);setTimeout(function(){setCopied(false);},2000);}catch(e){}
    document.body.removeChild(ta);
  }
  return (
    <div style={{border:"1px solid #E5E7EB",borderRadius:10,padding:"10px 13px",background:"#F9FAFB",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:3}}>{label}</div>
        <div style={{fontSize:10,fontFamily:"monospace",color:"#6B7280",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{text.split("\n").slice(1).join(" | ")}</div>
      </div>
      <button onClick={doCopy} style={{fontSize:11,fontWeight:600,border:"1px solid "+(copied?"#86EFAC":"#C7D2FE"),borderRadius:7,padding:"5px 13px",cursor:"pointer",background:copied?"#DCFCE7":"#EEF2FF",color:copied?"#166534":"#4338CA",whiteSpace:"nowrap",flexShrink:0}}>
        {copied?"Copied!":"Copy"}
      </button>
    </div>
  );
}

function TradingCaseCard(props) {
  var c=props.c; var setCases=props.setCases;
  var [localPaste,setLocalPaste]=useState("");
  var [localMode,setLocalMode]=useState("paste");
  var approvedRows=c.execRows.filter(function(r){return r.moApproval==="Approved";});
  var closedCount=approvedRows.filter(function(r){return r.tradingStatus==="Position Closed";}).length;
  var allClosed=approvedRows.length>0&&closedCount===approvedRows.length;

  function applyPaste() {
    var lines=localPaste.trim().split("\n").filter(function(l){return l.trim();});
    var updated=approvedRows.map(function(r,i) {
      if(!lines[i])return r;
      var cells=lines[i].split("\t").map(function(x){return x.trim();});
      var nr=cloneObj(r); nr.units=cells[0]||r.units||""; nr.forexRate=cells[1]||r.forexRate||""; nr.payment=cells[2]||r.payment||"";
      if(nr.units&&nr.forexRate&&nr.payment)nr.tradingStatus="Position Closed";
      return nr;
    });
    setCases(function(prev) {
      return prev.map(function(x) {
        if(x.id!==c.id)return x;
        var updMap={}; updated.forEach(function(r){updMap[r.id]=r;});
        var newRows=x.execRows.map(function(r){return updMap[r.id]||r;});
        var n=cloneObj(x); n.execRows=newRows; return n;
      });
    });
    setLocalPaste("");
  }

  function exportSheet() {
    var header="Row\tCID\tAsset\tInstrument ID\tPosition ID\tUnits\tEnd Forex Rate\tPayment to account";
    var rows=approvedRows.map(function(r){return r.rowNum+"\t"+r.cid+"\t"+r.asset+"\t"+r.instrumentID+"\t"+r.positionID+"\t"+(r.units||"")+"\t"+(r.forexRate||"")+"\t"+(r.payment||"");});
    var content=header+"\n"+rows.join("\n");
    var a=document.createElement("a"); a.href="data:text/plain;charset=utf-8,"+encodeURIComponent(content);
    a.download=c.cid+"_positions.tsv"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  return (
    <div style={{border:"2px solid "+(allClosed?"#86EFAC":"#E5E7EB"),borderRadius:12,background:"#fff",overflow:"hidden"}}>
      <div style={{background:allClosed?"#F0FDF4":"#F8FAFF",padding:"11px 14px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:10,color:"#9CA3AF"}}>{c.id} - {c.executionDate}</div>
          <div style={{fontSize:13,fontWeight:700}}>{c.clientName} - <span style={{fontFamily:"monospace",color:"#6366F1"}}>{c.cid}</span></div>
          <div style={{fontSize:11,color:"#6B7280"}}>{closedCount}/{approvedRows.length} positions closed</div>
        </div>
        <div style={{display:"flex",gap:7}}>
          {allClosed&&<span style={{background:"#DCFCE7",color:"#166534",borderRadius:99,padding:"3px 11px",fontSize:11,fontWeight:700}}>All closed</span>}
          <button onClick={exportSheet} style={{fontSize:11,fontWeight:600,background:"#F0FDF4",color:"#166534",border:"1px solid #86EFAC",borderRadius:7,padding:"5px 12px",cursor:"pointer"}}>Export sheet</button>
        </div>
      </div>
      <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
        <div style={{display:"flex",gap:0,border:"1px solid #E5E7EB",borderRadius:8,overflow:"hidden",width:"fit-content"}}>
          {[["paste","Paste 3 columns"],["upload","Upload file"]].map(function(m) {
            return <button key={m[0]} onClick={function(){setLocalMode(m[0]);}} style={{fontSize:11,fontWeight:600,padding:"6px 14px",border:"none",cursor:"pointer",background:localMode===m[0]?"#4338CA":"#fff",color:localMode===m[0]?"#fff":"#6B7280",borderRight:"1px solid #E5E7EB"}}>{m[1]}</button>;
          })}
        </div>
        {localMode==="paste"&&(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:10,color:"#9CA3AF",background:"#F9FAFB",borderRadius:5,padding:"5px 9px"}}>Paste: Units / End Forex Rate / Payment (tab-separated)</div>
            <textarea style={{width:"100%",minHeight:90,border:"1px solid #C7D2FE",borderRadius:8,padding:"7px 10px",fontSize:11,fontFamily:"monospace",boxSizing:"border-box",resize:"vertical"}} placeholder={"2.609977\t592.92\t1547.51"} value={localPaste} onChange={function(e){setLocalPaste(e.target.value);}}/>
            <div style={{display:"flex",gap:7}}>
              <button onClick={applyPaste} disabled={!localPaste.trim()} style={{background:localPaste.trim()?"#4338CA":"#D1D5DB",color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",fontSize:11,fontWeight:600,cursor:localPaste.trim()?"pointer":"not-allowed"}}>Apply</button>
              <button onClick={function(){setLocalPaste("");}} style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:7,padding:"6px 12px",fontSize:11,cursor:"pointer",color:"#6B7280"}}>Clear</button>
            </div>
          </div>
        )}
        {localMode==="upload"&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:11,color:"#6B7280",lineHeight:1.6}}>1. Click Export sheet above. 2. Fill Units, End Forex Rate, Payment. 3. Upload below.</div>
            <label style={{display:"flex",alignItems:"center",gap:10,border:"2px dashed #C7D2FE",borderRadius:9,padding:"13px 16px",cursor:"pointer",background:"#F8FAFF"}}>
              <span style={{fontSize:20}}>U</span>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:"#4338CA"}}>Upload completed TSV / CSV</div>
                <div style={{fontSize:10,color:"#9CA3AF"}}>Columns 6-8: Units / End Forex Rate / Payment</div>
              </div>
              <input type="file" accept=".csv,.tsv,.txt" style={{display:"none"}} onChange={function(e) {
                var file=e.target.files[0]; if(!file)return;
                var reader=new FileReader();
                reader.onload=function(ev) {
                  var text=ev.target.result; var sep=text.includes("\t")?"\t":",";
                  var lines=text.trim().split("\n").filter(function(l){return l.trim();});
                  var data=isNaN(parseFloat(lines[0].split(sep)[0]))?lines.slice(1):lines;
                  var updated=approvedRows.map(function(r,i) {
                    if(!data[i])return r;
                    var cells=data[i].split(sep).map(function(x){return x.replace(/^"|"$/g,"").trim();});
                    var units,forex,payment;
                    if(cells.length>=8){units=cells[5];forex=cells[6];payment=cells[7];}
                    else{units=cells[0];forex=cells[1];payment=cells[2];}
                    var nr=cloneObj(r); nr.units=units||r.units||""; nr.forexRate=forex||r.forexRate||""; nr.payment=payment||r.payment||"";
                    if(nr.units&&nr.forexRate&&nr.payment)nr.tradingStatus="Position Closed";
                    return nr;
                  });
                  setCases(function(prev) {
                    return prev.map(function(x) {
                      if(x.id!==c.id)return x;
                      var updMap={}; updated.forEach(function(r){updMap[r.id]=r;});
                      var newRows=x.execRows.map(function(r){return updMap[r.id]||r;});
                      var n=cloneObj(x); n.execRows=newRows; return n;
                    });
                  });
                };
                reader.readAsText(file);
              }}/>
            </label>
          </div>
        )}
        <PositionsTable rows={approvedRows} caseId={c.id} setCases={setCases} showMOApprove={false} showTradingInputs={true} showBOStatus={false}/>
      </div>
    </div>
  );
}

function ExecMODates(props) {
  var p=props;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{border:"1px solid #E5E7EB",borderRadius:12,overflow:"hidden"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontSize:12}}>
          <thead>
            <tr style={{background:"#F9FAFB"}}>
              {["Case","Client","Broker","Transfer date",""].map(function(h){return <th key={h} style={{padding:"8px 13px",textAlign:"left",fontWeight:600,color:"#374151",borderBottom:"1px solid #E5E7EB"}}>{h}</th>;})}
            </tr>
          </thead>
          <tbody>
            {p.brokerConfirmed.length===0&&<tr><td colSpan={5} style={{padding:"28px",textAlign:"center",color:"#9CA3AF"}}>No cases with broker confirmation yet</td></tr>}
            {p.brokerConfirmed.map(function(c,i) {
              var saved=p.savedDates[c.cid];
              return (
                <tr key={c.id} style={{background:i%2?"#F9FAFB":"#fff",borderBottom:"1px solid #F3F4F6"}}>
                  <td style={{padding:"9px 13px",fontFamily:"monospace",fontSize:10,color:"#9CA3AF"}}>{c.id}</td>
                  <td style={{padding:"9px 13px"}}><div style={{fontWeight:600,fontSize:13}}>{c.clientName}</div><div style={{fontSize:10,color:"#6B7280"}}>{c.cid}</div></td>
                  <td style={{padding:"9px 13px"}}>{c.broker}</td>
                  <td style={{padding:"9px 13px"}}>
                    {saved
                      ?<div style={{display:"flex",gap:7,alignItems:"center"}}>
                          <span style={{background:"#DCFCE7",color:"#166534",borderRadius:7,padding:"3px 9px",fontSize:11,fontWeight:700}}>{saved}</span>
                          <button onClick={function(){p.setSavedDates(function(prev){var n=cloneObj(prev);delete n[c.cid];return n;});}} style={{fontSize:10,border:"1px solid #D1D5DB",borderRadius:6,padding:"2px 7px",cursor:"pointer",background:"#fff"}}>Edit</button>
                        </div>
                      :<input type="date" style={{border:"1px solid #C7D2FE",borderRadius:8,padding:"5px 8px",fontSize:11}} value={p.transferDates[c.cid]||""} onChange={function(e){var v=e.target.value;p.setTransferDates(function(prev){var n=cloneObj(prev);n[c.cid]=v;return n;});}}/>}
                  </td>
                  <td style={{padding:"9px 13px"}}>
                    {!saved&&<button onClick={function(){p.saveDate(c.cid);}} disabled={!p.transferDates[c.cid]} style={{background:p.transferDates[c.cid]?"#2563EB":"#D1D5DB",color:"#fff",border:"none",borderRadius:7,padding:"5px 11px",fontSize:11,fontWeight:600,cursor:p.transferDates[c.cid]?"pointer":"not-allowed"}}>Set</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {Object.keys(p.byDate).sort().map(function(date) {
        var dc=p.byDate[date];
        return (
          <div key={date} style={{border:"1px solid #BFDBFE",borderRadius:12,padding:13,background:"#F8FAFF"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
              <div style={{fontSize:13,fontWeight:700,color:"#2563EB"}}>{date} - {dc.length} CID{dc.length!==1?"s":""}</div>
              <div style={{display:"flex",gap:7,alignItems:"center"}}>
                {p.copied&&<span style={{fontSize:10,color:"#16A34A",fontWeight:600}}>Copied!</span>}
                <button onClick={function(){navigator.clipboard&&navigator.clipboard.writeText(dc.map(function(c){return c.cid;}).join(","));p.setCopied(true);setTimeout(function(){p.setCopied(false);},2000);}} style={{background:"#2563EB",color:"#fff",border:"none",borderRadius:7,padding:"5px 11px",fontSize:11,fontWeight:600,cursor:"pointer"}}>Copy CIDs for Databricks</button>
              </div>
            </div>
            <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:7,padding:"6px 11px",fontFamily:"monospace",fontSize:11,color:"#1E40AF",marginBottom:7}}>{dc.map(function(c){return c.cid;}).join(",")}</div>
            {dc.map(function(c){return <div key={c.cid} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"5px 9px",background:"#fff",borderRadius:6,border:"1px solid #DBEAFE",marginBottom:3}}><span style={{fontWeight:600,fontFamily:"monospace"}}>{c.cid}</span><span>{c.clientName}</span><span style={{color:"#6B7280"}}>{c.instruments} instr.</span><span style={bs(c.status)}>{c.status}</span></div>;})}
          </div>
        );
      })}
    </div>
  );
}

function ExecOpsLoad(props) {
  var p=props;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {p.execReady.length>0&&(
        <div style={{border:"1px solid #BFDBFE",borderRadius:10,padding:"10px 14px",background:"#EFF6FF"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#1E40AF",marginBottom:6}}>CIDs ready for Databricks query</div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{fontFamily:"monospace",fontSize:12,color:"#1E40AF",background:"#fff",border:"1px solid #BFDBFE",borderRadius:6,padding:"5px 10px",flex:1}}>{p.execReady.map(function(c){return c.cid;}).join(", ")}</div>
            <button onClick={function(){navigator.clipboard&&navigator.clipboard.writeText(p.execReady.map(function(c){return c.cid;}).join(","));p.setCopied(true);setTimeout(function(){p.setCopied(false);},2000);}} style={{background:"#2563EB",color:"#fff",border:"none",borderRadius:7,padding:"6px 13px",fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>{p.copied?"Copied!":"Copy CIDs"}</button>
          </div>
        </div>
      )}
      {p.execReady.length>0&&(
        <div style={{border:"1px solid #C7D2FE",borderRadius:10,padding:"10px 14px",background:"#EEF2FF"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#3730A3",marginBottom:6}}>Paste all positions once (auto-distribute by CID)</div>
          <div style={{fontSize:10,color:"#6B7280",fontFamily:"monospace",background:"#fff",borderRadius:5,padding:"6px 9px",lineHeight:1.8,border:"1px solid #C7D2FE",marginBottom:8}}>
            Format: tab-separated. Supported: Databricks header export, or CID / PositionID / InstrumentID / Asset name.
          </div>
          <textarea style={{width:"100%",minHeight:100,border:"1px solid #C7D2FE",borderRadius:8,padding:"7px 10px",fontSize:11,fontFamily:"monospace",boxSizing:"border-box"}} placeholder={"67234\t3093873742\t1003\tMeta Platforms Inc\n55129\t2088439301\t1005\tMicrosoft Corp"} value={p.opsBulkPaste} onChange={function(e){p.setOpsBulkPaste(e.target.value);}}/>
          <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>
            <button onClick={p.parseOpsBulkPaste} disabled={!p.opsBulkPaste.trim()} style={{background:p.opsBulkPaste.trim()?"#4F46E5":"#D1D5DB",color:"#fff",border:"none",borderRadius:7,padding:"6px 13px",fontSize:11,fontWeight:600,cursor:p.opsBulkPaste.trim()?"pointer":"not-allowed"}}>Parse and distribute</button>
            <button onClick={function(){p.setOpsBulkPaste("");}} style={{background:"#fff",border:"1px solid #D1D5DB",borderRadius:7,padding:"6px 11px",fontSize:11,color:"#6B7280",cursor:"pointer"}}>Clear</button>
            {p.opsParseInfo.message&&<span style={{fontSize:11,fontWeight:600,color:p.opsParseInfo.type==="error"?"#DC2626":"#166534"}}>{p.opsParseInfo.message}</span>}
          </div>
        </div>
      )}
      {p.execReady.length===0&&<div style={{border:"1px dashed #E5E7EB",borderRadius:12,padding:36,textAlign:"center",color:"#9CA3AF"}}>No cases in execution queue yet</div>}
      {p.execReady.map(function(c) {
        var confirmed=p.opsConfirmed[c.id]; var pr=p.opsRows[c.id]||[]; var sa=SEED_ASSETS[c.id]||[];
        return (
          <div key={c.id} style={{border:"2px solid "+(confirmed?"#86EFAC":"#E5E7EB"),borderRadius:12,background:"#fff",overflow:"hidden"}}>
            <div style={{background:confirmed?"#F0FDF4":"#F8FAFF",padding:"11px 14px",borderBottom:"1px solid #E5E7EB"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:10,color:"#9CA3AF"}}>{c.id} - {c.executionDate||"Date TBC"}</div>
                  <div style={{fontSize:13,fontWeight:700}}>{c.clientName} <span style={{fontFamily:"monospace",color:"#6366F1",fontSize:12}}>CID: {c.cid}</span></div>
                </div>
                {confirmed&&<span style={{background:"#DCFCE7",color:"#166534",borderRadius:99,padding:"3px 11px",fontSize:11,fontWeight:700}}>Sent to MO for approval</span>}
              </div>
              <div style={{display:"flex",gap:5,marginTop:8,flexWrap:"wrap"}}>
                {sa.map(function(a) {
                  return <div key={a.symbol} style={{background:"#EEF2FF",border:"1px solid #C7D2FE",borderRadius:6,padding:"4px 10px",fontSize:11,display:"flex",gap:6,alignItems:"center"}}><span style={{fontWeight:700,fontFamily:"monospace",color:"#4338CA"}}>{a.symbol}</span><span style={{color:"#374151",fontWeight:600}}>{a.name}</span><span style={{color:"#6B7280"}}>{a.qty} units - {a.exchange}</span></div>;
                })}
              </div>
            </div>
            {!confirmed&&(
              <div style={{padding:"11px 14px",display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
                  {pr.length===0&&<span style={{fontSize:11,color:"#6B7280"}}>No rows parsed yet for this CID. Use the shared paste box above.</span>}
                  {pr.length>0&&<button onClick={function(){p.confirmOps(c.id);}} style={{background:"#16A34A",color:"#fff",border:"none",borderRadius:7,padding:"6px 13px",fontSize:11,fontWeight:600,cursor:"pointer"}}>Send to MO for approval</button>}
                  {p.opsExcluded[c.id]>0&&<span style={{fontSize:11,color:"#EA580C",fontWeight:600,background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:6,padding:"2px 8px"}}>{p.opsExcluded[c.id]} row{p.opsExcluded[c.id]!==1?"s":""} excluded</span>}
                </div>
                {pr.length>0&&<PositionsTable rows={pr} caseId={c.id} setCases={p.setCases} showMOApprove={false} showTradingInputs={false} showBOStatus={false}/>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ExecMOApprove(props) {
  var cases=props.cases; var setCases=props.setCases; var approveAllMO=props.approveAllMO;
  var execCases=cases.filter(function(c){return c.execRows&&c.execRows.length>0;});
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"9px 13px",fontSize:12,color:"#1E40AF"}}>Review each position and approve. Only approved rows go to Trading for closure.</div>
      {execCases.length===0&&<div style={{border:"1px dashed #E5E7EB",borderRadius:12,padding:36,textAlign:"center",color:"#9CA3AF"}}>No positions loaded yet.</div>}
      {execCases.map(function(c) {
        var allApproved=c.execRows.every(function(r){return r.moApproval==="Approved";});
        return (
          <div key={c.id} style={{border:"2px solid "+(allApproved?"#86EFAC":"#E5E7EB"),borderRadius:12,background:"#fff",overflow:"hidden"}}>
            <div style={{background:allApproved?"#F0FDF4":"#F8FAFF",padding:"11px 14px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:10,color:"#9CA3AF"}}>{c.id}</div>
                <div style={{fontSize:13,fontWeight:700}}>{c.clientName} - <span style={{fontFamily:"monospace",color:"#6366F1"}}>{c.cid}</span></div>
                <div style={{fontSize:11,color:"#6B7280"}}>{c.execRows.filter(function(r){return r.moApproval==="Approved";}).length}/{c.execRows.length} approved</div>
              </div>
              <button onClick={function(){approveAllMO(c.id);}} style={{fontSize:11,fontWeight:600,background:"#16A34A",color:"#fff",border:"none",borderRadius:7,padding:"7px 14px",cursor:"pointer"}}>Approve all and send to Trading</button>
            </div>
            <div style={{padding:"11px 14px"}}>
              <PositionsTable rows={c.execRows} caseId={c.id} setCases={setCases} showMOApprove={true} showTradingInputs={false} showBOStatus={false}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExecTrading(props) {
  var p=props;
  var [bulkPaste,setBulkPaste]=useState("");
  var [bulkInfo,setBulkInfo]=useState("");

  var approvedRows=useMemo(function(){
    var rows=[];
    p.cases.forEach(function(c){
      (c.execRows||[]).forEach(function(r){
        if(r.moApproval==="Approved"){
          var nr=cloneObj(r);
          nr.caseId=c.id;
          nr.clientName=c.clientName;
          rows.push(nr);
        }
      });
    });
    return rows;
  },[p.cases]);

  var closedCount=approvedRows.filter(function(r){return r.tradingStatus==="Position Closed";}).length;

  function updateGlobalRow(caseId,rowId,field,val){
    p.setCases(function(prev){
      return prev.map(function(c){
        if(c.id!==caseId)return c;
        var newRows=(c.execRows||[]).map(function(r){
          if(r.id!==rowId)return r;
          var nr=cloneObj(r);
          nr[field]=val;
          if(nr.units&&nr.forexRate&&nr.payment)nr.tradingStatus="Position Closed";
          return nr;
        });
        var n=cloneObj(c); n.execRows=newRows; return n;
      });
    });
  }

  function applyBulkPaste(){
    setBulkInfo("");
    var lines=bulkPaste.trim().split("\n").filter(function(l){return l.trim();});
    if(!lines.length){setBulkInfo("Nothing pasted.");return;}

    function normHeader(h){return String(h||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
    var headerCells=lines[0].split("\t").map(function(x){return x.trim();});
    var headerMap={};
    headerCells.forEach(function(h,idx){headerMap[normHeader(h)]=idx;});
    var hasHeader=headerMap.cid!==undefined&&headerMap.positionid!==undefined&&headerMap.units!==undefined&&(headerMap.endforexrate!==undefined||headerMap.forexrate!==undefined)&&(headerMap.paymenttoacct!==undefined||headerMap.payment!==undefined);
    var data=hasHeader?lines.slice(1):lines;

    var updatesByCase={};
    var updatesByKey={};

    function cellByHeader(cells,name){
      var i=headerMap[name];
      return i===undefined?"":(cells[i]||"").trim();
    }

    data.forEach(function(line){
      var cells=line.split("\t").map(function(x){return x.trim();});
      if(!cells.length)return;

      var cid="",positionID="",units="",forex="",payment="";

      if(hasHeader){
        cid=cellByHeader(cells,"cid");
        positionID=cellByHeader(cells,"positionid");
        units=cellByHeader(cells,"units");
        forex=cellByHeader(cells,"endforexrate")||cellByHeader(cells,"forexrate");
        payment=cellByHeader(cells,"paymenttoacct")||cellByHeader(cells,"payment");
      } else if(cells.length>=5){
        cid=cells[0]||"";
        positionID=cells[1]||"";
        units=cells[2]||"";
        forex=cells[3]||"";
        payment=cells[4]||"";
      }

      if(cid&&positionID&&(units||forex||payment)) {
        updatesByKey[cid+"|"+positionID]={units:units,forexRate:forex,payment:payment};
      }
    });

    var applied=0;
    if(Object.keys(updatesByKey).length>0){
      approvedRows.forEach(function(r){
        var u=updatesByKey[r.cid+"|"+r.positionID];
        if(!u)return;
        if(!updatesByCase[r.caseId])updatesByCase[r.caseId]={};
        updatesByCase[r.caseId][r.id]=u;
        applied++;
      });
    } else {
      approvedRows.forEach(function(r,i){
        if(!data[i])return;
        var cells=data[i].split("\t").map(function(x){return x.trim();});
        var units=cells[0]||"";
        var forex=cells[1]||"";
        var payment=cells[2]||"";
        if(!(units||forex||payment))return;
        if(!updatesByCase[r.caseId])updatesByCase[r.caseId]={};
        updatesByCase[r.caseId][r.id]={units:units,forexRate:forex,payment:payment};
        applied++;
      });
    }

    if(!applied){setBulkInfo("No valid rows to apply.");return;}

    p.setCases(function(prev){
      return prev.map(function(c){
        var updates=updatesByCase[c.id];
        if(!updates)return c;
        var newRows=(c.execRows||[]).map(function(r){
          var u=updates[r.id];
          if(!u)return r;
          var nr=cloneObj(r);
          nr.units=u.units||nr.units||"";
          nr.forexRate=u.forexRate||nr.forexRate||"";
          nr.payment=u.payment||nr.payment||"";
          if(nr.units&&nr.forexRate&&nr.payment)nr.tradingStatus="Position Closed";
          return nr;
        });
        var n=cloneObj(c); n.execRows=newRows; return n;
      });
    });
    setBulkInfo(applied+" row"+(applied!==1?"s":"")+" applied.");
  }

  function exportUnifiedSheet(){
    var header="Case ID\tClient\tCID\tAsset\tInstrument ID\tPosition ID\tUnits\tEnd Forex Rate\tPayment to account";
    var rows=approvedRows.map(function(r){
      return r.caseId+"\t"+r.clientName+"\t"+r.cid+"\t"+r.asset+"\t"+r.instrumentID+"\t"+r.positionID+"\t"+(r.units||"")+"\t"+(r.forexRate||"")+"\t"+(r.payment||"");
    });
    var content=header+"\n"+rows.join("\n");
    var a=document.createElement("a");
    a.href="data:text/plain;charset=utf-8,"+encodeURIComponent(content);
    a.download="trading_closure_all_cids.tsv";
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:8,padding:"9px 13px",fontSize:12,color:"#92400E",lineHeight:1.6}}>
        Fill Units, End Forex Rate and Payment for all MO-approved rows in one place.
      </div>
      {approvedRows.length===0&&<div style={{border:"1px dashed #E5E7EB",borderRadius:12,padding:36,textAlign:"center",color:"#9CA3AF"}}>No MO-approved rows yet. Complete stage 3 first.</div>}
      {approvedRows.length>0&&(
        <div style={{border:"2px solid #E5E7EB",borderRadius:12,background:"#fff",overflow:"hidden"}}>
          <div style={{background:closedCount===approvedRows.length?"#F0FDF4":"#F8FAFF",padding:"11px 14px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:13,fontWeight:700}}>Trading closure - all CIDs</div>
              <div style={{fontSize:11,color:"#6B7280"}}>{closedCount}/{approvedRows.length} positions closed</div>
            </div>
            <div style={{display:"flex",gap:7,alignItems:"center"}}>
              {closedCount===approvedRows.length&&approvedRows.length>0&&<span style={{background:"#DCFCE7",color:"#166534",borderRadius:99,padding:"3px 11px",fontSize:11,fontWeight:700}}>All closed</span>}
              <button onClick={exportUnifiedSheet} style={{fontSize:11,fontWeight:600,background:"#F0FDF4",color:"#166534",border:"1px solid #86EFAC",borderRadius:7,padding:"5px 12px",cursor:"pointer"}}>Export sheet</button>
            </div>
          </div>

          <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div style={{fontSize:10,color:"#9CA3AF",background:"#F9FAFB",borderRadius:5,padding:"5px 9px"}}>Paste all rows (tab-separated). Preferred: CID / PositionID / Units / End Forex Rate / Payment. Fallback: 3-column order by table.</div>
              <textarea style={{width:"100%",minHeight:90,border:"1px solid #C7D2FE",borderRadius:8,padding:"7px 10px",fontSize:11,fontFamily:"monospace",boxSizing:"border-box",resize:"vertical"}} placeholder={"55129\t3363741768\t634\t592.92\t1547.51"} value={bulkPaste} onChange={function(e){setBulkPaste(e.target.value);setBulkInfo("");}}/>
              <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
                <button onClick={applyBulkPaste} disabled={!bulkPaste.trim()} style={{background:bulkPaste.trim()?"#4338CA":"#D1D5DB",color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",fontSize:11,fontWeight:600,cursor:bulkPaste.trim()?"pointer":"not-allowed"}}>Apply to all</button>
                <button onClick={function(){setBulkPaste("");setBulkInfo("");}} style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:7,padding:"6px 12px",fontSize:11,cursor:"pointer",color:"#6B7280"}}>Clear</button>
                {bulkInfo&&<span style={{fontSize:11,color:bulkInfo.includes("applied")?"#166534":"#DC2626",fontWeight:600}}>{bulkInfo}</span>}
              </div>
            </div>

            <div style={{overflowX:"auto",border:"1px solid #E5E7EB",borderRadius:8}}>
              <table style={{borderCollapse:"collapse",fontSize:10,width:"100%"}}>
                <thead>
                  <tr style={{background:"#F1F5F9"}}>
                    {['#','Case','Client','CID','Asset','Instr ID','Position ID','Trading Status','MO Approval','Units','End Forex Rate','Payment to acct'].map(function(h){
                      return <th key={h} style={{padding:"5px 8px",textAlign:"left",fontWeight:600,color:"#374151",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap"}}>{h}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {approvedRows.map(function(r,ri){
                    var closed=r.tradingStatus==="Position Closed";
                    return (
                      <tr key={r.caseId+"-"+r.id} style={{background:closed?"#F0FDF4":ri%2?"#F9FAFB":"#fff",borderBottom:"1px solid #F3F4F6"}}>
                        <td style={{padding:"4px 8px",color:"#9CA3AF"}}>{ri+1}</td>
                        <td style={{padding:"4px 8px",fontFamily:"monospace",color:"#6B7280"}}>{r.caseId}</td>
                        <td style={{padding:"4px 8px",fontWeight:600}}>{r.clientName}</td>
                        <td style={{padding:"4px 8px",fontFamily:"monospace",color:"#1D4ED8",fontSize:10}}>{r.cid}</td>
                        <td style={{padding:"4px 8px",fontWeight:600}}>{r.asset}</td>
                        <td style={{padding:"4px 8px",fontFamily:"monospace"}}>{r.instrumentID}</td>
                        <td style={{padding:"4px 8px",fontFamily:"monospace",color:"#6366F1"}}>{r.positionID}</td>
                        <td style={{padding:"4px 8px"}}><StatusBadge v={r.tradingStatus||"New Request"} map={TRADING_COLORS}/></td>
                        <td style={{padding:"4px 8px"}}><StatusBadge v={r.moApproval||"Pending Approval"} map={MO_APR_COLORS}/></td>
                        <td style={{padding:"3px 5px"}}><input style={{border:"1px solid #C7D2FE",borderRadius:5,padding:"2px 5px",fontSize:10,width:70,textAlign:"right"}} value={r.units||""} onChange={function(e){updateGlobalRow(r.caseId,r.id,"units",e.target.value);}}/></td>
                        <td style={{padding:"3px 5px"}}><input style={{border:"1px solid #C7D2FE",borderRadius:5,padding:"2px 5px",fontSize:10,width:60,textAlign:"right"}} value={r.forexRate||""} onChange={function(e){updateGlobalRow(r.caseId,r.id,"forexRate",e.target.value);}}/></td>
                        <td style={{padding:"3px 5px"}}><input style={{border:"1px solid #C7D2FE",borderRadius:5,padding:"2px 5px",fontSize:10,width:70,textAlign:"right"}} value={r.payment||""} onChange={function(e){updateGlobalRow(r.caseId,r.id,"payment",e.target.value);}}/></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <div style={{border:"1px solid #C7D2FE",borderRadius:12,padding:14,background:"#EEF2FF"}}>
        <div style={{fontSize:13,fontWeight:700,color:"#4338CA",marginBottom:6}}>Confirm USD deduction amounts</div>
        <div style={{fontSize:11,color:"#6B7280",marginBottom:10}}>Paste CID, Asset name and confirmed USD amount.</div>
        <div style={{fontSize:10,color:"#9CA3AF",fontFamily:"monospace",background:"#fff",borderRadius:5,padding:"5px 9px",marginBottom:8,border:"1px solid #C7D2FE"}}>CID    Asset Name    USD Amount</div>
        <textarea style={{width:"100%",minHeight:80,border:"1px solid #C7D2FE",borderRadius:8,padding:"7px 10px",fontSize:11,fontFamily:"monospace",boxSizing:"border-box"}} placeholder={"45061\tMeta Platforms Inc\t45061.93"} value={p.usdPaste} onChange={function(e){p.setUsdPaste(e.target.value);p.setUsdError("");}}/>
        {p.usdError&&<div style={{fontSize:11,color:"#DC2626",marginTop:5}}>{p.usdError}</div>}
        {p.usdFinalized&&<div style={{fontSize:11,color:"#16A34A",fontWeight:600,marginTop:5}}>USD amounts applied - go to stage 5 to copy deduction files.</div>}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button onClick={p.applyUSDPaste} disabled={!p.usdPaste.trim()} style={{background:p.usdPaste.trim()?"#4338CA":"#D1D5DB",color:"#fff",border:"none",borderRadius:8,padding:"7px 18px",fontSize:12,fontWeight:600,cursor:p.usdPaste.trim()?"pointer":"not-allowed"}}>Apply USD amounts</button>
          <button onClick={function(){p.setUsdPaste("");p.setUsdFinalized(false);}} style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:8,padding:"7px 12px",fontSize:11,cursor:"pointer",color:"#6B7280"}}>Clear</button>
        </div>
      </div>
    </div>
  );
}

function ExecBOStatus(props) {
  var cases=props.cases; var setCases=props.setCases;
  var boCases=cases.filter(function(c){return c.execRows&&c.execRows.length>0;});
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:8,padding:"9px 13px",fontSize:12,color:"#92400E"}}>
        Update BO Status for each position after deduction is processed. Copy deduction files using the buttons below.
      </div>
      {boCases.length===0&&<div style={{border:"1px dashed #E5E7EB",borderRadius:12,padding:36,textAlign:"center",color:"#9CA3AF"}}>No execution rows yet.</div>}
      {boCases.map(function(c) {
        var allBO=c.execRows.length>0&&c.execRows.every(function(r){return r.boStatus==="Completed";});
        var baseRef=c.opsReference||c.compensationNote||"ACATSOUT";
        // Per-asset references: each asset gets baseRef+0, baseRef+1, etc.
        // Parse the numeric suffix and offset per row
        var refBase=baseRef.replace(/[^0-9]/g,"");
        var refPrefix=baseRef.replace(/[0-9]+$/,"");
        var refNum=parseInt(refBase)||500;

        var dedLines=c.execRows.map(function(r,ri){
          var assetRef=refPrefix+(refNum+ri);
          return c.cid+"/"+r.payment+"/USD/"+assetRef+"/"+(r.asset||"Securities")+" Transfer out";
        });
        var feeLines=c.execRows.map(function(r,ri){
          var assetRef=refPrefix+(refNum+ri);
          return c.cid+"/100/USD/"+assetRef+"FEE/"+(r.asset||"Securities")+" Transfer out fee";
        });
        var dedText="CID\tAmount\tDescription\n"+dedLines.join("\n");
        var feesText="CID\tAmount\tDescription\n"+feeLines.join("\n");
        function markAllBO() {
          setCases(function(prev) {
            return prev.map(function(x) {
              if(x.id!==c.id)return x;
              var newRows=x.execRows.map(function(r){var nr=cloneObj(r);nr.boStatus="Completed";return nr;});
              var n=cloneObj(x); n.execRows=newRows;
              if(newRows.every(function(r){return r.boStatus==="Completed";}))n.status="Completed - Waiting Transfer";
              return n;
            });
          });
        }
        return (
          <div key={c.id} style={{border:"2px solid "+(allBO?"#86EFAC":"#E5E7EB"),borderRadius:12,background:"#fff",overflow:"hidden"}}>
            <div style={{background:allBO?"#F0FDF4":"#F8FAFF",padding:"11px 14px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:10,color:"#9CA3AF"}}>{c.id}</div>
                <div style={{fontSize:13,fontWeight:700}}>{c.clientName} - <span style={{fontFamily:"monospace",color:"#6366F1"}}>{c.cid}</span></div>
                <div style={{fontSize:11,color:"#6B7280"}}>{c.execRows.filter(function(r){return r.boStatus==="Completed";}).length}/{c.execRows.length} BO completed</div>
              </div>
              <div style={{display:"flex",gap:7,alignItems:"center"}}>
                {allBO&&<span style={{background:"#DCFCE7",color:"#166534",borderRadius:99,padding:"3px 11px",fontSize:11,fontWeight:700}}>BO complete</span>}
                <button onClick={markAllBO} style={{fontSize:11,fontWeight:600,background:"#16A34A",color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",cursor:"pointer"}}>Mark all BO Completed</button>
              </div>
            </div>
            <div style={{padding:"11px 14px",display:"flex",flexDirection:"column",gap:8}}>
              <CopyBlock label="File 1 - ACATs Out Deduction" text={dedText}/>
              <CopyBlock label="File 2 - ACATs Out Fees" text={feesText}/>
            </div>
            <div style={{padding:"0 14px 14px"}}>
              <div style={{fontSize:11,fontWeight:600,color:"#374151",marginBottom:6}}>BO Position Status</div>
              <PositionsTable rows={c.execRows} caseId={c.id} setCases={setCases} showMOApprove={false} showTradingInputs={false} showBOStatus={true}/>
            </div>
            {allBO&&(
              <div style={{margin:"0 14px 14px",background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"9px 13px",fontSize:12,color:"#1E40AF"}}>
                All BO deductions confirmed - case status set to Completed - Waiting Transfer to Broker.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ExecutionTab(props) {
  var cases=props.cases; var setCases=props.setCases;
  var [view,setView]=useState("mo");
  var [transferDates,setTransferDates]=useState({});
  var [savedDates,setSavedDates]=useState({});
  var [copied,setCopied]=useState(false);
  var [opsBulkPaste,setOpsBulkPaste]=useState("");
  var [opsParseInfo,setOpsParseInfo]=useState({type:"",message:""});
  var [opsRows,setOpsRows]=useState({});
  var [opsConfirmed,setOpsConfirmed]=useState({});
  var [opsExcluded,setOpsExcluded]=useState({});
  var [usdPaste,setUsdPaste]=useState("");
  var [usdError,setUsdError]=useState("");
  var [usdFinalized,setUsdFinalized]=useState(false);

  var execReady=cases.filter(function(c){return ["Execution Ready","Executing"].includes(c.status);});
  var brokerConfirmed=cases.filter(function(c){return ["Broker Outreach","Execution Ready","Executing"].includes(c.status);});

  var byDate=useMemo(function() {
    var m={};
    Object.keys(savedDates).forEach(function(cid) {
      var date=savedDates[cid]; if(!m[date])m[date]=[];
      var found=null; for(var i=0;i<cases.length;i++){if(cases[i].cid===cid){found=cases[i];break;}}
      if(found)m[date].push(found);
    });
    return m;
  },[savedDates,cases]);

  function saveDate(cid) {
    if(!transferDates[cid])return;
    var d=transferDates[cid];
    setSavedDates(function(prev){var n=cloneObj(prev);n[cid]=d;return n;});
    var found=null; for(var i=0;i<cases.length;i++){if(cases[i].cid===cid){found=cases[i];break;}}
    if(found)setCases(function(prev){return patchCase(prev,found.id,{executionDate:d,status:"Execution Ready"});});
  }

  function parseOpsBulkPaste() {
    setOpsParseInfo({type:"",message:""});
    var lines=opsBulkPaste.trim().split("\n").filter(function(l){return l.trim();});
    if(!lines.length){setOpsParseInfo({type:"error",message:"Nothing pasted."});return;}

    function normHeader(h){return String(h||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
    var headerCells=lines[0].split("\t").map(function(x){return x.trim();});
    var headerMap={};
    headerCells.forEach(function(h,idx){headerMap[normHeader(h)]=idx;});
    var hasHeader=headerMap.cid!==undefined&&headerMap.positionid!==undefined&&headerMap.instrumentid!==undefined&&(headerMap.instrument!==undefined||headerMap.asset!==undefined||headerMap.assetname!==undefined);

    var readyByCid={};
    execReady.forEach(function(c){readyByCid[c.cid]=c;});

    var nextRows={};
    var nextExcluded={};
    var parsedCount=0;
    var dropped=0;

    lines.forEach(function(line,li) {
      var cells=line.split("\t").map(function(x){return x.trim();});
      if(!cells.length)return;

      if(hasHeader&&li===0)return;

      var targetCase=null;
      var positionID="";
      var instrumentID="";
      var asset="";

      function cellByHeader(name){
        var i=headerMap[name];
        return i===undefined?"":(cells[i]||"").trim();
      }

      if(hasHeader) {
        var cidVal=cellByHeader("cid");
        targetCase=readyByCid[cidVal]||null;
        if(targetCase) {
          positionID=cellByHeader("positionid");
          instrumentID=cellByHeader("instrumentid");
          asset=cellByHeader("instrument")||cellByHeader("asset")||cellByHeader("assetname");
        }
      }

      if(!targetCase&&cells.length>=4) {
        targetCase=readyByCid[cells[0]]||null;
        if(targetCase) {
          positionID=cells[1]||"";
          instrumentID=cells[2]||"";
          asset=cells.slice(3).join(" ").trim();
        }
      }

      if(!targetCase&&execReady.length===1&&cells.length>=3) {
        targetCase=execReady[0];
        positionID=cells[0]||"";
        instrumentID=cells[1]||"";
        asset=cells.slice(2).join(" ").trim();
      }

      if(!targetCase){dropped++;return;}

      var sa=SEED_ASSETS[targetCase.id]||[];
      var approvedAssets=sa.map(function(a){return a.name.toLowerCase();});
      var assetLower=(asset||"").toLowerCase();
      var allowed=!assetLower||approvedAssets.length===0||approvedAssets.some(function(a){return assetLower.includes(a)||a.includes(assetLower);});

      if(!allowed) {
        nextExcluded[targetCase.id]=(nextExcluded[targetCase.id]||0)+1;
        dropped++;
        return;
      }

      if(!nextRows[targetCase.id])nextRows[targetCase.id]=[];
      var rowNum=String(nextRows[targetCase.id].length+1);
      nextRows[targetCase.id].push({
        id:Date.now()+parsedCount,
        rowNum:rowNum,
        addedDate:targetCase.executionDate||new Date().toLocaleDateString(),
        cid:targetCase.cid,
        asset:asset,
        instrumentID:instrumentID,
        positionID:positionID,
        units:"",
        forexRate:"",
        payment:"",
        tradingStatus:"New Request",
        moApproval:"Pending Approval",
        boStatus:"Pending"
      });
      parsedCount++;
    });

    setOpsRows(function(prev){
      var n=cloneObj(prev);
      execReady.forEach(function(c){if(!opsConfirmed[c.id])delete n[c.id];});
      Object.keys(nextRows).forEach(function(caseId){n[caseId]=nextRows[caseId];});
      return n;
    });

    setOpsExcluded(function(prev){
      var n=cloneObj(prev);
      execReady.forEach(function(c){if(!opsConfirmed[c.id])n[c.id]=0;});
      Object.keys(nextExcluded).forEach(function(caseId){n[caseId]=nextExcluded[caseId];});
      return n;
    });

    if(!parsedCount){setOpsParseInfo({type:"error",message:"No valid rows found. Use tab-separated columns. Supported: Databricks header export or CID, PositionID, InstrumentID, Asset."});return;}
    setOpsParseInfo({type:"success",message:parsedCount+" row"+(parsedCount!==1?"s":"")+" distributed"+(dropped?"; "+dropped+" excluded":"")+"."});
  }

  function confirmOps(caseId) {
    var rows=opsRows[caseId]||[];
    var assetFromRows=""; for(var i=0;i<rows.length;i++){if(rows[i].asset){assetFromRows=rows[i].asset;break;}}
    setOpsConfirmed(function(prev){var n=cloneObj(prev);n[caseId]=true;return n;});
    setCases(function(prev){return patchCase(prev,caseId,{execRows:rows,status:"Executing",asset:assetFromRows});});
  }

  function approveAllMO(caseId) {
    setCases(function(prev) {
      return prev.map(function(c) {
        if(c.id!==caseId)return c;
        var newRows=c.execRows.map(function(r) {
          return {id:r.id,rowNum:r.rowNum,addedDate:r.addedDate,cid:r.cid,asset:r.asset,instrumentID:r.instrumentID,positionID:r.positionID,units:"",forexRate:r.forexRate,payment:r.payment,tradingStatus:r.tradingStatus||"New Request",moApproval:"Approved",boStatus:r.boStatus||"Pending"};
        });
        var n=cloneObj(c); n.execRows=newRows; return n;
      });
    });
  }

  function applyUSDPaste() {
    setUsdError("");
    var lines=usdPaste.trim().split("\n").filter(function(l){return l.trim();});
    if(!lines.length){setUsdError("Nothing pasted.");return;}
    var updates=[];
    lines.forEach(function(line) {
      var cells=line.split("\t").map(function(x){return x.trim();});
      if(cells.length<2)return;
      var cid=cells[0]; var asset=cells.length>=3?cells[1]:""; var usd=cells.length>=3?cells[2]:cells[1];
      updates.push({cid:cid,asset:asset,usd:usd});
    });
    if(!updates.length){setUsdError("Could not parse.");return;}
    setCases(function(prev) {
      return prev.map(function(c) {
        var match=null; for(var i=0;i<updates.length;i++){if(updates[i].cid===c.cid){match=updates[i];break;}}
        if(!match)return c;
        var newRows=c.execRows.map(function(r){var nr=cloneObj(r);nr.tradingStatus="Position Closed";return nr;});
        var n=cloneObj(c); n.execRows=newRows; n.tradingAmount=match.usd; return n;
      });
    });
    setUsdPaste(""); setUsdFinalized(true);
  }

  var allExecRows=useMemo(function() {
    var all=[];
    cases.forEach(function(c){(c.execRows||[]).forEach(function(r){all.push(r);});});
    Object.keys(opsRows).forEach(function(k){if(!opsConfirmed[k])(opsRows[k]||[]).forEach(function(r){all.push(r);});});
    return all;
  },[cases,opsRows,opsConfirmed]);

  var execStats=useMemo(function() {
    var cidSet={},assetSet={},totalPos=0,totalUnits=0;
    allExecRows.forEach(function(r) {
      if(r.cid)cidSet[r.cid]=true;
      if(r.asset)assetSet[r.cid+"|"+r.asset]=true;
      totalPos++; totalUnits+=parseFloat(r.units)||0;
    });
    return {cids:Object.keys(cidSet).length,assets:Object.keys(assetSet).length,positions:totalPos,units:totalUnits.toFixed(4),totalCIDs:execReady.length};
  },[allExecRows,execReady]);

  var views=[["mo","1 - MO: Set dates"],["ops","2 - Ops: Load positions"],["mo-approve","3 - MO: Approve"],["trading","4 - Trading: Closure"],["bo","5 - Ops: BO + Export"]];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{border:"1px solid #E5E7EB",borderRadius:12,padding:"12px 16px",background:"#fff"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:10}}>Execution day - live tracker</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
          {[["CIDs",execStats.cids+"/"+execStats.totalCIDs,"#2563EB"],["Assets",execStats.assets,"#7C3AED"],["Positions",execStats.positions,"#0D9488"],["Total units",execStats.units,"#EA580C"],["Finalized",usdFinalized?"Done":"--","#16A34A"]].map(function(t) {
            return (
              <div key={t[0]} style={{textAlign:"center",padding:"10px 6px",background:t[2]+"08",borderRadius:10,border:"1px solid "+t[2]+"22"}}>
                <div style={{fontSize:20,fontWeight:800,color:t[2]}}>{t[1]}</div>
                <div style={{fontSize:11,fontWeight:600,color:t[2],marginTop:2}}>{t[0]}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{display:"flex",gap:0,border:"1px solid #E5E7EB",borderRadius:10,overflow:"hidden"}}>
        {views.map(function(v) {
          return <button key={v[0]} onClick={function(){setView(v[0]);}} style={{flex:1,fontSize:11,fontWeight:600,padding:"9px 4px",border:"none",cursor:"pointer",background:view===v[0]?"#374151":"#fff",color:view===v[0]?"#fff":"#6B7280",borderRight:"1px solid #E5E7EB",textAlign:"center"}}>{v[1]}</button>;
        })}
      </div>
      {view==="mo"&&<ExecMODates brokerConfirmed={brokerConfirmed} savedDates={savedDates} setSavedDates={setSavedDates} transferDates={transferDates} setTransferDates={setTransferDates} saveDate={saveDate} byDate={byDate} copied={copied} setCopied={setCopied}/>}
      {view==="ops"&&<ExecOpsLoad execReady={execReady} cases={cases} setCases={setCases} opsRows={opsRows} opsConfirmed={opsConfirmed} opsExcluded={opsExcluded} opsBulkPaste={opsBulkPaste} setOpsBulkPaste={setOpsBulkPaste} parseOpsBulkPaste={parseOpsBulkPaste} opsParseInfo={opsParseInfo} confirmOps={confirmOps} copied={copied} setCopied={setCopied}/>}
      {view==="mo-approve"&&<ExecMOApprove cases={cases} setCases={setCases} approveAllMO={approveAllMO}/>}
      {view==="trading"&&<ExecTrading cases={cases} setCases={setCases} usdPaste={usdPaste} setUsdPaste={setUsdPaste} usdError={usdError} setUsdError={setUsdError} usdFinalized={usdFinalized} setUsdFinalized={setUsdFinalized} applyUSDPaste={applyUSDPaste}/>}
      {view==="bo"&&<ExecBOStatus cases={cases} setCases={setCases}/>}
    </div>
  );
}

function ReportsTab(props) {
  var cases=props.cases;
  var [period,setPeriod]=useState("all");
  var [customFrom,setCustomFrom]=useState("");
  var [customTo,setCustomTo]=useState("");
  var [showCustom,setShowCustom]=useState(false);

  // ── Date filter ──
  var now=new Date();
  function inPeriod(c){
    var d=new Date(c.submittedDate);
    if(isNaN(d))return true;
    if(period==="custom"){
      var from=customFrom?new Date(customFrom):null;
      var to=customTo?new Date(customTo):null;
      if(to){to=new Date(to);to.setHours(23,59,59,999);}
      if(from&&d<from)return false;
      if(to&&d>to)return false;
      return true;
    }
    if(period==="all")return true;
    var days=period==="7"?7:period==="30"?30:period==="90"?90:365;
    return (now-d)/(1000*60*60*24)<=days;
  }
  var fc=cases.filter(inPeriod);

  // Custom range label for display
  var customLabel=customFrom||customTo
    ?(customFrom||"…")+" → "+(customTo||"…")
    :"Pick dates";

  // ── Core metrics ──
  var total=fc.length;
  var completed=fc.filter(function(c){return c.status==="Completed";});
  var active=fc.filter(function(c){return !["Completed","Rejected"].includes(c.status);});
  var rejected=fc.filter(function(c){return c.status==="Rejected";});
  var totalValue=fc.reduce(function(s,c){return s+Number(c.valueUSD||0);},0);
  var completedValue=completed.reduce(function(s,c){return s+Number(c.tradingAmount||c.valueUSD||0);},0);
  var totalFees=fc.reduce(function(s,c){return s+Number(c.fees||0);},0);
  var totalInstruments=fc.reduce(function(s,c){return s+Number(c.instruments||0);},0);
  var avgValue=total>0?totalValue/total:0;
  var completionRate=total>0?Math.round(completed.length/total*100):0;

  // ── Broker breakdown ──
  var brokerMap={};
  fc.forEach(function(c){
    if(!c.broker)return;
    if(!brokerMap[c.broker])brokerMap[c.broker]={name:c.broker,count:0,value:0,completed:0};
    brokerMap[c.broker].count++;
    brokerMap[c.broker].value+=Number(c.valueUSD||0);
    if(c.status==="Completed")brokerMap[c.broker].completed++;
  });
  var brokers=Object.values(brokerMap).sort(function(a,b){return b.value-a.value;});

  // ── Country breakdown ──
  var countryMap={};
  fc.forEach(function(c){
    var co=c.country||"Unknown";
    if(!countryMap[co])countryMap[co]={count:0,value:0};
    countryMap[co].count++;countryMap[co].value+=Number(c.valueUSD||0);
  });
  var countries=Object.entries(countryMap).map(function(e){return{country:e[0],count:e[1].count,value:e[1].value};}).sort(function(a,b){return b.count-a.count;});

  // ── Club tier breakdown ──
  var clubOrder=["Diamond","Platinum Plus","Platinum","Gold","Silver","Bronze","Standard",""];
  var clubMap={};
  fc.forEach(function(c){
    var cl=(c.opsClub||c.club||"Unknown");
    if(!clubMap[cl])clubMap[cl]={count:0,value:0};
    clubMap[cl].count++;clubMap[cl].value+=Number(c.valueUSD||0);
  });
  var clubs=Object.entries(clubMap).map(function(e){return{club:e[0],count:e[1].count,value:e[1].value};}).sort(function(a,b){
    var ai=clubOrder.indexOf(a.club);var bi=clubOrder.indexOf(b.club);
    return (ai<0?99:ai)-(bi<0?99:bi);
  });

  // ── Rejection reasons ──
  var rejReasons={};
  rejected.forEach(function(c){
    var n=(c.notes||[]).slice().reverse().find(function(n){return n.text.startsWith("Rejected:");});
    var reason=n?n.text.replace("Rejected:","").trim().slice(0,60):"No reason recorded";
    rejReasons[reason]=(rejReasons[reason]||0)+1;
  });
  var rejList=Object.entries(rejReasons).map(function(e){return{reason:e[0],count:e[1]};}).sort(function(a,b){return b.count-a.count;});

  // ── Assets traded ──
  var assetMap={};
  fc.forEach(function(c){
    (SEED_ASSETS[c.id]||c.formAssets||[]).forEach(function(a){
      if(!assetMap[a.symbol])assetMap[a.symbol]={symbol:a.symbol,name:a.name,exchange:a.exchange,count:0,totalQty:0};
      assetMap[a.symbol].count++;
      assetMap[a.symbol].totalQty+=Number(a.qty||0);
    });
  });
  var assets=Object.values(assetMap).sort(function(a,b){return b.count-a.count;});

  // ── Transfer type ──
  var ncbo=fc.filter(function(c){return c.transferType!=="CBO";}).length;
  var cbo=fc.filter(function(c){return c.transferType==="CBO";}).length;

  // ── Submitted by (Ops agents) ──
  var agentMap={};
  fc.forEach(function(c){
    var a=c.submittedByName||"Unknown";
    if(!agentMap[a])agentMap[a]={name:a,count:0};
    agentMap[a].count++;
  });
  var agents=Object.values(agentMap).sort(function(a,b){return b.count-a.count;});

  function fmt(n){if(n>=1000000)return"$"+(n/1000000).toFixed(1)+"M";if(n>=1000)return"$"+(n/1000).toFixed(0)+"k";return"$"+Math.round(n);}

  // ── SVG Bar Chart ──
  function BarChart(p){
    var data=p.data; var labelKey=p.labelKey; var valKey=p.valKey; var color=p.color||"#6366F1"; var fmtFn=p.fmt||function(v){return v;};
    var maxV=Math.max.apply(null,data.map(function(d){return d[valKey]||0;}).concat([1]));
    var bh=22; var gap=6; var h=data.length*(bh+gap)+10;
    return (
      <svg width="100%" height={h} viewBox={"0 0 400 "+h} preserveAspectRatio="none" style={{display:"block",overflow:"visible"}}>
        {data.map(function(d,i){
          var v=d[valKey]||0;var w=Math.max(v/maxV*260,v>0?3:0);var y=i*(bh+gap);
          return (
            <g key={i}>
              <text x={0} y={y+bh-5} fontSize={10} fill="#6B7280" style={{fontFamily:"system-ui"}}>{(d[labelKey]||"").toString().slice(0,18)}</text>
              <rect x={120} y={y+3} width={w} height={bh-6} rx={4} fill={color} opacity={0.85}/>
              <text x={120+w+6} y={y+bh-5} fontSize={10} fontWeight={700} fill={color} style={{fontFamily:"system-ui"}}>{fmtFn(v)}</text>
            </g>
          );
        })}
      </svg>
    );
  }

  // ── Donut chart ──
  function DonutChart(p){
    var data=p.data; var total2=data.reduce(function(s,d){return s+(d.v||0);},0)||1;
    var r=50;var cx=65;var cy=65;var circ=2*Math.PI*r;var offset=0;
    var slices=data.map(function(d){
      var pct=d.v/total2;var dash=pct*circ;
      var s={...d,pct:pct,dash:dash,offset:offset};offset+=dash;return s;
    });
    return (
      <svg width={130} height={130}>
        {slices.map(function(s,i){
          return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={18}
            strokeDasharray={s.dash+" "+(circ-s.dash)} strokeDashoffset={circ/4-s.offset} strokeLinecap="butt"/>;
        })}
        <circle cx={cx} cy={cy} r={r-9} fill="white"/>
        <text x={cx} y={cy+4} textAnchor="middle" fontSize={14} fontWeight={800} fill="#111827" style={{fontFamily:"system-ui"}}>{total}</text>
        <text x={cx} y={cy+17} textAnchor="middle" fontSize={9} fill="#9CA3AF" style={{fontFamily:"system-ui"}}>cases</text>
      </svg>
    );
  }

  var statusDonut=[
    {label:"Active",   v:active.length,    color:"#6366F1"},
    {label:"Completed",v:completed.length, color:"#22C55E"},
    {label:"Rejected", v:rejected.length,  color:"#EF4444"},
  ];

  var CLUB_COLOR={"Diamond":"#A855F7","Platinum Plus":"#3B82F6","Platinum":"#60A5FA","Gold":"#F59E0B","Silver":"#94A3B8","Bronze":"#C2410C","Standard":"#6B7280","Unknown":"#D1D5DB"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:0,fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .r-card{animation:fadeUp .35s ease both}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{background:"linear-gradient(135deg,#0F172A 0%,#1E1B4B 60%,#0F172A 100%)",borderRadius:16,padding:"24px 28px",marginBottom:18,position:"relative",overflow:"visible"}}>
        <div style={{position:"absolute",inset:0,borderRadius:16,overflow:"hidden",pointerEvents:"none"}}>
          <div style={{position:"absolute",inset:0,opacity:0.07,backgroundImage:"linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",backgroundSize:"32px 32px"}}/>
          <div style={{position:"absolute",top:-30,right:40,width:180,height:180,borderRadius:"50%",background:"#7C3AED",opacity:0.13,filter:"blur(50px)"}}/>
        </div>
        <div style={{position:"relative",zIndex:10,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#64748B",letterSpacing:3,textTransform:"uppercase",marginBottom:4}}>Management Report · ACAT Out</div>
            <div style={{fontSize:24,fontWeight:800,color:"#F8FAFC",letterSpacing:-0.5}}>Transfer Activity Overview</div>
            <div style={{fontSize:12,color:"#475569",marginTop:3}}>Generated {new Date().toLocaleDateString([],{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {/* Preset period buttons */}
            <div style={{display:"flex",background:"rgba(255,255,255,0.07)",borderRadius:10,padding:3,border:"1px solid rgba(255,255,255,0.1)"}}>
              {[["all","All time"],["7","7d"],["30","30d"],["90","90d"],["365","1yr"]].map(function(p){
                return (
                  <button key={p[0]}
                    onClick={function(){setPeriod(p[0]);setShowCustom(false);}}
                    style={{fontSize:11,fontWeight:600,padding:"5px 11px",borderRadius:7,border:"none",cursor:"pointer",
                      background:period===p[0]&&period!=="custom"?"rgba(255,255,255,0.15)":"transparent",
                      color:period===p[0]&&period!=="custom"?"#F8FAFC":"#64748B"}}>
                    {p[1]}
                  </button>
                );
              })}
            </div>

            {/* Custom date range picker */}
            <div style={{position:"relative"}}>
              <button
                onClick={function(){setShowCustom(!showCustom);}}
                style={{fontSize:11,fontWeight:600,padding:"6px 12px",borderRadius:8,border:"1px solid "+(period==="custom"?"#818CF8":"rgba(255,255,255,0.15)"),
                  cursor:"pointer",display:"flex",alignItems:"center",gap:6,
                  background:period==="custom"?"rgba(129,140,248,0.2)":"rgba(255,255,255,0.07)",
                  color:period==="custom"?"#A5B4FC":"#94A3B8"}}>
                <span>📅</span>
                <span>{period==="custom"?customLabel:"Custom range"}</span>
                {period==="custom"&&(
                  <span onClick={function(e){e.stopPropagation();setPeriod("all");setCustomFrom("");setCustomTo("");setShowCustom(false);}}
                    style={{marginLeft:2,opacity:0.7,fontSize:12,fontWeight:700,lineHeight:1}}>×</span>
                )}
              </button>

              {showCustom&&(
                <div style={{position:"absolute",top:"calc(100% + 10px)",right:0,zIndex:9999,
                  background:"#1E293B",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,
                  padding:16,boxShadow:"0 20px 60px rgba(0,0,0,0.7)",minWidth:290,
                  pointerEvents:"all"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:12,letterSpacing:1,textTransform:"uppercase"}}>Custom date range</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                    <div>
                      <label style={{fontSize:10,color:"#64748B",display:"block",marginBottom:4,fontWeight:600}}>From</label>
                      <input type="date"
                        value={customFrom}
                        max={customTo||undefined}
                        onChange={function(e){setCustomFrom(e.target.value);}}
                        style={{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:7,
                          padding:"7px 9px",fontSize:12,color:"#F1F5F9",boxSizing:"border-box",
                          colorScheme:"dark"}}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:"#64748B",display:"block",marginBottom:4,fontWeight:600}}>To</label>
                      <input type="date"
                        value={customTo}
                        min={customFrom||undefined}
                        onChange={function(e){setCustomTo(e.target.value);}}
                        style={{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:7,
                          padding:"7px 9px",fontSize:12,color:"#F1F5F9",boxSizing:"border-box",
                          colorScheme:"dark"}}/>
                    </div>
                  </div>

                  {/* Quick presets inside picker */}
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
                    {(function(){
                      var today=new Date();
                      function iso(d){return d.toISOString().slice(0,10);}
                      function addDays(d,n){var r=new Date(d);r.setDate(r.getDate()+n);return r;}
                      var presets=[
                        {label:"This month",  from:iso(new Date(today.getFullYear(),today.getMonth(),1)),      to:iso(today)},
                        {label:"Last month",  from:iso(new Date(today.getFullYear(),today.getMonth()-1,1)),    to:iso(new Date(today.getFullYear(),today.getMonth(),0))},
                        {label:"This quarter",from:iso(new Date(today.getFullYear(),Math.floor(today.getMonth()/3)*3,1)), to:iso(today)},
                        {label:"This year",   from:iso(new Date(today.getFullYear(),0,1)),                     to:iso(today)},
                      ];
                      return presets.map(function(p){
                        return (
                          <button key={p.label}
                            onClick={function(){setCustomFrom(p.from);setCustomTo(p.to);}}
                            style={{fontSize:10,fontWeight:600,padding:"4px 9px",borderRadius:6,cursor:"pointer",border:"1px solid rgba(255,255,255,0.12)",
                              background:customFrom===p.from&&customTo===p.to?"rgba(129,140,248,0.25)":"rgba(255,255,255,0.05)",
                              color:customFrom===p.from&&customTo===p.to?"#A5B4FC":"#94A3B8"}}>
                            {p.label}
                          </button>
                        );
                      });
                    })()}
                  </div>

                  <div style={{display:"flex",gap:8}}>
                    <button
                      onClick={function(){
                        setPeriod("custom");
                        setShowCustom(false);
                      }}
                      disabled={!customFrom&&!customTo}
                      style={{flex:1,background:(customFrom||customTo)?"#6366F1":"rgba(255,255,255,0.05)",color:(customFrom||customTo)?"#fff":"#475569",
                        border:"none",borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,
                        cursor:(customFrom||customTo)?"pointer":"not-allowed"}}>
                      Apply range
                    </button>
                    <button
                      onClick={function(){setCustomFrom("");setCustomTo("");setPeriod("all");setShowCustom(false);}}
                      style={{background:"rgba(255,255,255,0.05)",color:"#64748B",border:"1px solid rgba(255,255,255,0.1)",
                        borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer"}}>
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <div className="reports-print-area">
      {/* ── TOP KPI STRIP ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:16}}>
        {[
          {label:"Total cases",      val:total,              sub:"all time",            color:"#6366F1"},
          {label:"Total value",      val:fmt(totalValue),    sub:"USD requested",       color:"#0EA5E9"},
          {label:"Value transferred",val:fmt(completedValue),sub:"USD completed",       color:"#22C55E"},
          {label:"Fees collected",   val:fmt(totalFees),     sub:"$100 per instrument", color:"#F59E0B"},
          {label:"Completion rate",  val:completionRate+"%", sub:completed.length+" completed", color:"#10B981"},
          {label:"Instruments",      val:totalInstruments,   sub:"total requested",     color:"#8B5CF6"},
        ].map(function(k,i){
          return (
            <div key={k.label} className="r-card" style={{animationDelay:(i*50)+"ms",background:"#fff",border:"1px solid #E5E7EB",borderRadius:12,padding:"14px 14px 12px",borderTop:"3px solid "+k.color}}>
              <div style={{fontSize:22,fontWeight:800,color:k.color,lineHeight:1,marginBottom:4}}>{k.val}</div>
              <div style={{fontSize:11,fontWeight:700,color:"#111827"}}>{k.label}</div>
              <div style={{fontSize:10,color:"#9CA3AF",marginTop:2}}>{k.sub}</div>
            </div>
          );
        })}
      </div>

      {/* ── ROW 1: Status donut + Broker table ── */}
      <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:14,marginBottom:14}}>

        {/* Status breakdown donut */}
        <div className="r-card" style={{animationDelay:"100ms",background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:"18px 16px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#111827",marginBottom:12}}>Status breakdown</div>
          <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
            <DonutChart data={statusDonut}/>
          </div>
          {statusDonut.map(function(d){
            return (
              <div key={d.label} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                <div style={{width:8,height:8,borderRadius:2,background:d.color,flexShrink:0}}/>
                <div style={{flex:1,fontSize:11,color:"#374151"}}>{d.label}</div>
                <div style={{fontSize:12,fontWeight:700,color:d.color}}>{d.v}</div>
                <div style={{fontSize:10,color:"#9CA3AF",width:32,textAlign:"right"}}>{total>0?Math.round(d.v/total*100):0}%</div>
              </div>
            );
          })}
          <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F3F4F6"}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#9CA3AF",marginBottom:4}}>
              <span>NCBO</span><span style={{fontWeight:700,color:"#374151"}}>{ncbo}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#9CA3AF"}}>
              <span>CBO (rejected)</span><span style={{fontWeight:700,color:"#EF4444"}}>{cbo}</span>
            </div>
          </div>
        </div>

        {/* Broker league table */}
        <div className="r-card" style={{animationDelay:"150ms",background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:"18px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"#111827"}}>Broker league table</div>
            <div style={{fontSize:10,color:"#9CA3AF"}}>{brokers.length} brokers</div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%",fontSize:11}}>
              <thead>
                <tr style={{background:"#F8FAFC"}}>
                  {["#","Broker","Cases","Value USD","Completed","Rate"].map(function(h){
                    return <th key={h} style={{padding:"7px 10px",textAlign:h==="#"||h==="#"?"center":"left",fontWeight:700,color:"#6B7280",borderBottom:"2px solid #E5E7EB",whiteSpace:"nowrap",fontSize:10,textTransform:"uppercase",letterSpacing:0.5}}>{h}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {brokers.slice(0,8).map(function(b,i){
                  var rate=b.count>0?Math.round(b.completed/b.count*100):0;
                  var isTop=i===0;
                  return (
                    <tr key={b.name} style={{borderBottom:"1px solid #F3F4F6",background:isTop?"#FAFAF5":"#fff"}}>
                      <td style={{padding:"9px 10px",textAlign:"center"}}>
                        <span style={{fontSize:12,fontWeight:800,color:i===0?"#F59E0B":i===1?"#94A3B8":i===2?"#C2410C":"#D1D5DB"}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</span>
                      </td>
                      <td style={{padding:"9px 10px",fontWeight:700,color:"#111827"}}>{b.name}</td>
                      <td style={{padding:"9px 10px",textAlign:"center",fontWeight:600,color:"#374151"}}>{b.count}</td>
                      <td style={{padding:"9px 10px",fontWeight:700,color:"#0EA5E9"}}>{fmt(b.value)}</td>
                      <td style={{padding:"9px 10px",textAlign:"center",color:"#22C55E",fontWeight:600}}>{b.completed}</td>
                      <td style={{padding:"9px 10px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{flex:1,height:4,background:"#F3F4F6",borderRadius:99,overflow:"hidden"}}>
                            <div style={{height:"100%",width:rate+"%",background:rate>=70?"#22C55E":rate>=40?"#F59E0B":"#EF4444",borderRadius:99}}/>
                          </div>
                          <span style={{fontSize:10,fontWeight:700,color:rate>=70?"#16A34A":rate>=40?"#92400E":"#DC2626",width:28,textAlign:"right"}}>{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── ROW 2: Club tiers + Countries + Agents ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:14}}>

        {/* Club tier distribution */}
        <div className="r-card" style={{animationDelay:"200ms",background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:"18px 16px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#111827",marginBottom:12}}>Client club tiers</div>
          {clubs.map(function(cl,i){
            var color=CLUB_COLOR[cl.club]||"#94A3B8";
            var pct=total>0?cl.count/total*100:0;
            return (
              <div key={cl.club} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:11,fontWeight:600,color:"#374151"}}>{cl.club||"Unknown"}</span>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:10,color:"#9CA3AF"}}>{fmt(cl.value)}</span>
                    <span style={{fontSize:11,fontWeight:700,color:color}}>{cl.count}</span>
                  </div>
                </div>
                <div style={{height:5,background:"#F3F4F6",borderRadius:99,overflow:"hidden"}}>
                  <div style={{height:"100%",width:pct+"%",background:color,borderRadius:99,transition:"width .8s ease"}}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Country breakdown */}
        <div className="r-card" style={{animationDelay:"250ms",background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:"18px 16px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#111827",marginBottom:12}}>Country breakdown</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {countries.slice(0,8).map(function(co,i){
              var pct=total>0?co.count/total*100:0;
              var colors=["#6366F1","#0EA5E9","#22C55E","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6"];
              var col=colors[i%colors.length];
              return (
                <div key={co.country} style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#374151",width:28,flexShrink:0}}>{co.country}</div>
                  <div style={{flex:1,height:16,background:"#F8FAFC",borderRadius:5,overflow:"hidden",position:"relative"}}>
                    <div style={{position:"absolute",left:0,top:0,bottom:0,width:pct+"%",background:col,borderRadius:5,transition:"width .8s ease"}}/>
                    {co.count>0&&<div style={{position:"absolute",left:5,top:0,bottom:0,display:"flex",alignItems:"center",fontSize:9,fontWeight:700,color:"#fff",zIndex:1,textShadow:"0 1px 2px rgba(0,0,0,.4)"}}>{fmt(co.value)}</div>}
                  </div>
                  <div style={{fontSize:11,fontWeight:700,color:col,width:16,textAlign:"right"}}>{co.count}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Agents + volume */}
        <div className="r-card" style={{animationDelay:"300ms",background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:"18px 16px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#111827",marginBottom:12}}>Submitted by agent</div>
          {agents.map(function(a,i){
            var pct=total>0?a.count/total*100:0;
            return (
              <div key={a.name} style={{display:"flex",alignItems:"center",gap:9,marginBottom:8}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:"#6366F1"+(i===0?"":"44"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:i===0?"#fff":"#6366F1",flexShrink:0}}>
                  {a.name.split(" ").map(function(w){return w[0]||"";}).join("").toUpperCase().slice(0,2)}
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:11,fontWeight:600,color:"#374151"}}>{a.name}</span>
                    <span style={{fontSize:11,fontWeight:700,color:"#6366F1"}}>{a.count}</span>
                  </div>
                  <div style={{height:3,background:"#F3F4F6",borderRadius:99}}>
                    <div style={{height:"100%",width:pct+"%",background:"#6366F1",borderRadius:99}}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── ROW 3: Assets breakdown + Rejection analysis ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>

        {/* Assets breakdown */}
        <div className="r-card" style={{animationDelay:"350ms",background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:"18px 20px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#111827",marginBottom:14}}>Assets requested</div>
          {assets.length===0&&<div style={{fontSize:12,color:"#9CA3AF",textAlign:"center",padding:"20px 0"}}>No asset data available</div>}
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%",fontSize:11}}>
              <thead>
                <tr style={{background:"#F8FAFC"}}>
                  {["Symbol","Security name","Exchange","Cases","Total units"].map(function(h){
                    return <th key={h} style={{padding:"6px 10px",textAlign:"left",fontWeight:700,color:"#6B7280",borderBottom:"2px solid #E5E7EB",fontSize:10,textTransform:"uppercase",letterSpacing:0.4,whiteSpace:"nowrap"}}>{h}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {assets.slice(0,8).map(function(a,i){
                  return (
                    <tr key={a.symbol} style={{borderBottom:"1px solid #F3F4F6"}}>
                      <td style={{padding:"8px 10px",fontWeight:800,fontFamily:"monospace",color:"#4338CA",fontSize:12}}>{a.symbol}</td>
                      <td style={{padding:"8px 10px",fontWeight:600,color:"#111827"}}>{a.name}</td>
                      <td style={{padding:"8px 10px",color:"#9CA3AF"}}>{a.exchange}</td>
                      <td style={{padding:"8px 10px",textAlign:"center"}}>
                        <span style={{background:"#EEF2FF",color:"#4338CA",borderRadius:99,padding:"1px 8px",fontWeight:700,fontSize:11}}>{a.count}</span>
                      </td>
                      <td style={{padding:"8px 10px",fontWeight:700,color:"#374151",textAlign:"right"}}>{a.totalQty.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rejection analysis */}
        <div className="r-card" style={{animationDelay:"400ms",background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:"18px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"#111827"}}>Rejection analysis</div>
            <div style={{fontSize:22,fontWeight:800,color:"#EF4444"}}>{rejected.length} <span style={{fontSize:11,fontWeight:500,color:"#9CA3AF"}}>total</span></div>
          </div>
          {rejected.length===0&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"30px 0",gap:8}}>
              <div style={{fontSize:28}}>🎉</div>
              <div style={{fontSize:12,color:"#6B7280",fontWeight:600}}>No rejections in this period</div>
            </div>
          )}
          {rejList.map(function(r,i){
            var pct=rejected.length>0?r.count/rejected.length*100:0;
            var colors=["#EF4444","#F97316","#F59E0B","#84CC16","#06B6D4"];
            var col=colors[i%colors.length];
            return (
              <div key={r.reason} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,gap:8}}>
                  <span style={{fontSize:11,color:"#374151",flex:1,lineHeight:1.3}}>{r.reason}</span>
                  <span style={{fontSize:12,fontWeight:800,color:col,flexShrink:0}}>{r.count}</span>
                </div>
                <div style={{height:4,background:"#F3F4F6",borderRadius:99}}>
                  <div style={{height:"100%",width:pct+"%",background:col,borderRadius:99}}/>
                </div>
              </div>
            );
          })}
          {/* Rejected cases mini-list */}
          {rejected.length>0&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #F3F4F6"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:0.5,marginBottom:7}}>Rejected cases</div>
              {rejected.slice(0,4).map(function(c){
                return (
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,padding:"5px 8px",background:"#FEF9F9",borderRadius:7,border:"1px solid #FECACA"}}>
                    <div style={{fontSize:10,fontFamily:"monospace",color:"#9CA3AF",flexShrink:0}}>{c.id}</div>
                    <div style={{fontSize:11,fontWeight:600,color:"#374151",flex:1}}>{c.clientName}</div>
                    <div style={{fontSize:10,color:"#9CA3AF"}}>{c.broker}</div>
                    <div style={{fontSize:11,fontWeight:700,color:"#EF4444"}}>{fmt(Number(c.valueUSD||0))}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── FULL CASE TABLE ── */}
      <div className="r-card" style={{animationDelay:"450ms",background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:"18px 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:"#111827"}}>All cases — {period==="all"?"full history":period==="7"?"last 7 days":period==="30"?"last 30 days":period==="90"?"last 90 days":period==="custom"?customLabel:"this year"}</div>
          <div style={{fontSize:11,color:"#9CA3AF"}}>{fc.length} case{fc.length!==1?"s":""} · {fmt(totalValue)} total</div>
        </div>
        <div style={{overflowX:"auto",maxHeight:340,overflowY:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%",fontSize:11}}>
            <thead>
              <tr style={{background:"#F8FAFC",position:"sticky",top:0,zIndex:1}}>
                {["Case ID","Client","CID","Country","Club","Broker","Value USD","Instruments","Status","Submitted","Reference"].map(function(h){
                  return <th key={h} style={{padding:"7px 12px",textAlign:"left",fontWeight:700,color:"#6B7280",borderBottom:"2px solid #E5E7EB",whiteSpace:"nowrap",fontSize:10,textTransform:"uppercase",letterSpacing:0.4}}>{h}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {fc.map(function(c,ri){
                var isRej=c.status==="Rejected";
                return (
                  <tr key={c.id} style={{background:isRej?"#FEF9F9":ri%2?"#F9FAFB":"#fff",borderBottom:"1px solid #F3F4F6"}}>
                    <td style={{padding:"7px 12px",fontFamily:"monospace",fontSize:10,color:"#9CA3AF"}}>{c.id}</td>
                    <td style={{padding:"7px 12px",fontWeight:700,color:"#111827",whiteSpace:"nowrap"}}>{c.clientName}</td>
                    <td style={{padding:"7px 12px",fontFamily:"monospace",color:"#4338CA",fontWeight:600}}>{c.cid}</td>
                    <td style={{padding:"7px 12px",color:"#374151"}}>{c.country}</td>
                    <td style={{padding:"7px 12px"}}>
                      {(c.opsClub||c.club)&&<span style={{background:(CLUB_COLOR[c.opsClub||c.club]||"#94A3B8")+"18",color:CLUB_COLOR[c.opsClub||c.club]||"#94A3B8",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700}}>{c.opsClub||c.club}</span>}
                    </td>
                    <td style={{padding:"7px 12px",fontWeight:600,color:"#374151"}}>{c.broker}</td>
                    <td style={{padding:"7px 12px",fontWeight:700,color:"#0EA5E9",textAlign:"right"}}>${Number(c.valueUSD).toLocaleString()}</td>
                    <td style={{padding:"7px 12px",textAlign:"center",color:"#374151"}}>{c.instruments}</td>
                    <td style={{padding:"7px 12px"}}><span style={bs(c.status)}>{c.status}</span></td>
                    <td style={{padding:"7px 12px",color:"#9CA3AF",whiteSpace:"nowrap"}}>{c.submittedDate}</td>
                    <td style={{padding:"7px 12px",fontFamily:"monospace",fontSize:10,color:"#5B21B6",background:"#EDE9FE10"}}>{c.opsReference}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </div>{/* end reports-print-area */}
    </div>
  );
}

function PermissionManager(props) {
  var permissions=props.permissions; var setPermissions=props.setPermissions;
  var [openUser,setOpenUser]=useState(null);
  var [pinEdit,setPinEdit]=useState("");
  var [pinError,setPinError]=useState("");
  var [pinSaved,setPinSaved]=useState(null);
  // New user form
  var [email,setEmail]=useState("");
  var [name,setName]=useState("");
  var [newPin,setNewPin]=useState("");
  var [newRoles,setNewRoles]=useState(["Operations"]);
  var [newExtraTabs,setNewExtraTabs]=useState([]);
  var [saved,setSaved]=useState(false);

  function toggleOpenUser(em){setOpenUser(openUser===em?null:em);setPinEdit("");setPinError("");}

  function updateUser(em,patch){
    setPermissions(permissions.map(function(x){
      if(x.email!==em)return x;
      var n=cloneObj(x);Object.keys(patch).forEach(function(k){n[k]=patch[k];});return n;
    }));
  }

  function toggleUserRole(em,role){
    var pp=permissions.find(function(x){return x.email===em;});
    if(!pp)return;
    var cur=pp.roles||[pp.role];
    var next=cur.includes(role)?cur.filter(function(r){return r!==role;}):[...cur,role];
    if(next.length===0)return; // must keep at least one role
    updateUser(em,{roles:next});
  }

  function toggleUserExtraTab(em,tab){
    var pp=permissions.find(function(x){return x.email===em;});
    if(!pp)return;
    var cur=pp.extraTabs||[];
    var next=cur.includes(tab)?cur.filter(function(t){return t!==tab;}):cur.concat([tab]);
    updateUser(em,{extraTabs:next});
  }

  function removeUser(em){setPermissions(permissions.filter(function(x){return x.email!==em;}));}

  function addUser(){
    if(!email.trim()||!name.trim()||newPin.length<4)return;
    var e=email.trim().toLowerCase();
    var idx=permissions.findIndex(function(x){return x.email.toLowerCase()===e;});
    var entry={email:e,name:name.trim(),roles:newRoles,extraTabs:newExtraTabs,pin:newPin};
    if(idx>=0){setPermissions(permissions.map(function(x,xi){return xi===idx?entry:x;}));}
    else{setPermissions(permissions.concat([entry]));}
    setEmail("");setName("");setNewPin("");setNewRoles(["Operations"]);setNewExtraTabs([]);
    setSaved(true);setTimeout(function(){setSaved(false);},2500);
  }

  // Compute what tabs are already covered by the selected roles (for extraTabs display)
  function tabsCoveredByRoles(roles){
    var covered={};
    roles.forEach(function(r){(TAB_MAP[r]||[]).forEach(function(t){covered[t]=true;});});
    return covered;
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14,maxWidth:720}}>
      <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:10,padding:"11px 14px",fontSize:12,color:"#1E40AF",lineHeight:1.7}}>
        <strong>How it works:</strong> Any eToro email can sign in. Unlisted users get Requester access. Listed users get all tabs and queue access from their assigned roles. You can also grant individual tabs from other roles without adding the full role.
      </div>

      {/* User list */}
      {permissions.map(function(pp){
        var roles=pp.roles||[pp.role||"Requester"];
        var extraTabs=pp.extraTabs||[];
        var isOpen=openUser===pp.email;
        var coveredTabs=tabsCoveredByRoles(roles);
        var primaryRole=roles[0]||"Requester";
        var primaryColor=ROLE_COLOR[primaryRole]||"#374151";

        return (
          <div key={pp.email} style={{border:"2px solid "+(isOpen?primaryColor+"44":"#E5E7EB"),borderRadius:12,overflow:"hidden",background:"#fff"}}>
            {/* Row header */}
            <div onClick={function(){toggleOpenUser(pp.email);}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",cursor:"pointer",background:isOpen?primaryColor+"06":"#fff"}}>
              <Avatar name={pp.name} role={primaryRole} size={34}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>{pp.name}</div>
                <div style={{fontSize:11,color:"#9CA3AF"}}>{pp.email}</div>
              </div>
              {/* Role badges */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
                {roles.map(function(r){
                  return <span key={r} style={{fontSize:10,fontWeight:700,background:(ROLE_COLOR[r]||"#374151")+"15",color:ROLE_COLOR[r]||"#374151",borderRadius:99,padding:"2px 9px",border:"1px solid "+(ROLE_COLOR[r]||"#374151")+"30"}}>{r}</span>;
                })}
                {extraTabs.length>0&&<span style={{fontSize:10,fontWeight:600,background:"#F3F4F6",color:"#6B7280",borderRadius:99,padding:"2px 9px"}}>+{extraTabs.length} tab{extraTabs.length!==1?"s":""}</span>}
              </div>
              <span style={{fontSize:11,color:"#9CA3AF",marginLeft:4}}>{isOpen?"▲":"▼"}</span>
            </div>

            {/* Expanded settings */}
            {isOpen&&(
              <div style={{borderTop:"1px solid #E5E7EB",padding:16,display:"flex",flexDirection:"column",gap:16}}>

                {/* Roles section */}
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:8}}>Roles <span style={{fontWeight:400,color:"#9CA3AF"}}>(select one or more — tabs and queue access are merged)</span></div>
                  <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                    {ROLES.map(function(r){
                      var active=roles.includes(r);
                      var color=ROLE_COLOR[r]||"#374151";
                      var isLastRole=active&&roles.length===1;
                      return (
                        <button key={r}
                          onClick={function(){if(!isLastRole)toggleUserRole(pp.email,r);}}
                          title={isLastRole?"Must have at least one role":""}
                          style={{padding:"7px 14px",fontSize:12,fontWeight:700,borderRadius:9,cursor:isLastRole?"not-allowed":"pointer",border:"2px solid "+(active?color:"#E5E7EB"),background:active?color:"#fff",color:active?"#fff":color,opacity:isLastRole?0.5:1}}>
                          {active?"✓ ":""}{r}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{fontSize:10,color:"#9CA3AF",marginTop:6}}>
                    Tabs included: {Object.keys(coveredTabs).join(", ")||"none"}
                  </div>
                </div>

                {/* Extra individual tabs */}
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:8}}>Individual tab access <span style={{fontWeight:400,color:"#9CA3AF"}}>(grant specific tabs without assigning the full role)</span></div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {ALL_TABS.filter(function(t){return !coveredTabs[t];}).map(function(t){
                      var active=extraTabs.includes(t);
                      return (
                        <button key={t}
                          onClick={function(){toggleUserExtraTab(pp.email,t);}}
                          style={{padding:"5px 12px",fontSize:11,fontWeight:600,borderRadius:7,cursor:"pointer",border:"2px solid "+(active?"#6366F1":"#E5E7EB"),background:active?"#EEF2FF":"#fff",color:active?"#4338CA":"#6B7280"}}>
                          {active?"✓ ":""}{t}
                        </button>
                      );
                    })}
                    {ALL_TABS.filter(function(t){return !coveredTabs[t];}).length===0&&(
                      <div style={{fontSize:11,color:"#9CA3AF",fontStyle:"italic"}}>All tabs already covered by assigned roles.</div>
                    )}
                  </div>
                </div>

                {/* PIN change + remove */}
                <div style={{display:"flex",gap:10,alignItems:"flex-start",flexWrap:"wrap",paddingTop:8,borderTop:"1px solid #F3F4F6"}}>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#374151"}}>Change PIN</div>
                    <div style={{display:"flex",gap:7,alignItems:"center"}}>
                      <input type="password" inputMode="numeric" maxLength={6}
                        style={{border:"1px solid #C7D2FE",borderRadius:8,padding:"6px 10px",fontSize:14,width:110,letterSpacing:6,textAlign:"center"}}
                        placeholder="••••" value={pinEdit}
                        onChange={function(e){setPinEdit(e.target.value.replace(/\D/g,"").slice(0,6));setPinError("");}}/>
                      <button
                        onClick={function(){
                          if(pinEdit.length<4){setPinError("Min 4 digits.");return;}
                          updateUser(pp.email,{pin:pinEdit});
                          setPinEdit("");setPinSaved(pp.email);
                          setTimeout(function(){setPinSaved(null);},2500);
                        }}
                        disabled={pinEdit.length<4}
                        style={{background:pinEdit.length>=4?"#4338CA":"#D1D5DB",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:pinEdit.length>=4?"pointer":"not-allowed"}}>
                        Save PIN
                      </button>
                      {pinError&&<span style={{fontSize:11,color:"#DC2626"}}>{pinError}</span>}
                      {pinSaved===pp.email&&<span style={{fontSize:11,color:"#16A34A",fontWeight:600}}>✓ PIN updated</span>}
                    </div>
                  </div>
                  {!roles.includes("Admin")&&(
                    <button onClick={function(){removeUser(pp.email);setOpenUser(null);}}
                      style={{marginLeft:"auto",fontSize:12,fontWeight:600,color:"#EF4444",border:"1px solid #FECACA",borderRadius:8,padding:"6px 14px",cursor:"pointer",background:"#FEF2F2",alignSelf:"flex-end"}}>
                      Remove user
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add new user */}
      <div style={{border:"2px dashed #E5E7EB",borderRadius:12,padding:18,background:"#FAFBFF"}}>
        <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:12}}>Grant access to a new user</div>
        {saved&&<div style={{background:"#F0FDF4",border:"1px solid #86EFAC",color:"#166534",fontSize:12,padding:"7px 12px",borderRadius:8,marginBottom:10,fontWeight:600}}>✓ Saved. Takes effect on next login.</div>}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
          <div>
            <label style={{fontSize:11,color:"#9CA3AF",display:"block",marginBottom:3}}>Company email</label>
            <input style={{width:"100%",border:"1px solid #E5E7EB",borderRadius:8,padding:"8px 10px",fontSize:13,boxSizing:"border-box"}} placeholder="user@etoro.com" value={email} onChange={function(e){setEmail(e.target.value);}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"#9CA3AF",display:"block",marginBottom:3}}>Display name</label>
            <input style={{width:"100%",border:"1px solid #E5E7EB",borderRadius:8,padding:"8px 10px",fontSize:13,boxSizing:"border-box"}} placeholder="Full name" value={name} onChange={function(e){setName(e.target.value);}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"#9CA3AF",display:"block",marginBottom:3}}>PIN (4–6 digits)</label>
            <input type="password" inputMode="numeric" maxLength={6} style={{width:"100%",border:"1px solid #E5E7EB",borderRadius:8,padding:"8px 10px",fontSize:13,boxSizing:"border-box",letterSpacing:4}} placeholder="••••" value={newPin} onChange={function(e){setNewPin(e.target.value.replace(/\D/g,"").slice(0,6));}}/>
          </div>
        </div>

        <div style={{marginBottom:12}}>
          <label style={{fontSize:11,color:"#9CA3AF",display:"block",marginBottom:6}}>Assign roles <span style={{color:"#374151"}}>(select one or more)</span></label>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {ROLES.map(function(r){
              var active=newRoles.includes(r);
              var color=ROLE_COLOR[r]||"#374151";
              return (
                <button key={r} onClick={function(){setNewRoles(active?newRoles.filter(function(x){return x!==r;}):[...newRoles,r]);}}
                  style={{padding:"7px 14px",fontSize:12,fontWeight:700,borderRadius:9,cursor:"pointer",border:"2px solid "+(active?color:"#E5E7EB"),background:active?color:"#fff",color:active?"#fff":color}}>
                  {active?"✓ ":""}{r}
                </button>
              );
            })}
          </div>
          <div style={{fontSize:10,color:"#9CA3AF",marginTop:5}}>
            {newRoles.length>0&&("Tabs included: "+Object.keys(tabsCoveredByRoles(newRoles)).join(", "))}
          </div>
        </div>

        {/* Extra tabs for new user */}
        {ALL_TABS.filter(function(t){return !tabsCoveredByRoles(newRoles)[t];}).length>0&&(
          <div style={{marginBottom:14}}>
            <label style={{fontSize:11,color:"#9CA3AF",display:"block",marginBottom:6}}>Additional individual tabs <span style={{color:"#374151"}}>(optional)</span></label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {ALL_TABS.filter(function(t){return !tabsCoveredByRoles(newRoles)[t];}).map(function(t){
                var active=newExtraTabs.includes(t);
                return (
                  <button key={t} onClick={function(){setNewExtraTabs(active?newExtraTabs.filter(function(x){return x!==t;}):[...newExtraTabs,t]);}}
                    style={{padding:"5px 12px",fontSize:11,fontWeight:600,borderRadius:7,cursor:"pointer",border:"2px solid "+(active?"#6366F1":"#E5E7EB"),background:active?"#EEF2FF":"#fff",color:active?"#4338CA":"#6B7280"}}>
                    {active?"✓ ":""}{t}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button onClick={addUser} disabled={!email.trim()||!name.trim()||newPin.length<4||newRoles.length===0}
          style={{background:email.trim()&&name.trim()&&newPin.length>=4&&newRoles.length>0?"#111827":"#D1D5DB",color:"#fff",border:"none",borderRadius:9,padding:"10px 24px",fontSize:13,fontWeight:600,cursor:email.trim()&&name.trim()&&newPin.length>=4&&newRoles.length>0?"pointer":"not-allowed"}}>
          Save permission →
        </button>
      </div>
    </div>
  );
}

function LoginScreen(props) {
  var onLogin=props.onLogin; var permissions=props.permissions;
  var [email,setEmail]=useState("");
  var [pin,setPin]=useState("");
  var [displayName,setDisplayName]=useState("");
  var [step,setStep]=useState("email");
  var [matchedUser,setMatchedUser]=useState(null);
  var [error,setError]=useState("");

  function handleEmailNext() {
    var e=email.trim().toLowerCase();
    if(!e||!e.includes("@")){setError("Enter a valid company email.");return;}
    var found=null;
    for(var i=0;i<permissions.length;i++){if(permissions[i].email.toLowerCase()===e){found=permissions[i];break;}}
    if(found){setMatchedUser(found);setStep("pin");setError("");}
    else{
      var raw=e.split("@")[0].replace(/[._]/g," ");
      var nm=raw.replace(/\b\w/g,function(l){return l.toUpperCase();});
      onLogin({id:e,name:nm,email:e,role:"Requester"});
    }
  }

  function handlePinDigit(d) {
    if(!matchedUser)return;
    var np=pin+d; setPin(np); setError("");
    if(np.length>=matchedUser.pin.length){setTimeout(function(){verifyPin(np);},120);}
  }

  function verifyPin(p) {
    if(!matchedUser)return;
    if(p===matchedUser.pin){setStep("name");setDisplayName("");setError("");}
    else{setPin("");setError("Incorrect PIN. Try again.");}
  }

  function handleNameSubmit() {
    var n=displayName.trim();
    if(!n){setError("Please enter your name.");return;}
    onLogin({id:matchedUser.email,name:n,email:matchedUser.email,role:(matchedUser.roles&&matchedUser.roles[0])||matchedUser.role,accountName:matchedUser.name});
  }

  var digits=["1","2","3","4","5","6","7","8","9","","0","<"];

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F9FAFB",fontFamily:"system-ui,sans-serif",padding:20}}>
      <div style={{maxWidth:360,width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:30,fontWeight:800,color:"#111827",letterSpacing:-1}}>ACAT Out</div>
          <div style={{fontSize:14,color:"#6B7280",marginTop:4}}>Securities transfer tracker</div>
        </div>
        <div style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:14,padding:24,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
          {step==="email"&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",textAlign:"center"}}>Sign in to ACAT Out</div>
              {error&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"8px 11px",fontSize:12,color:"#DC2626"}}>{error}</div>}
              <div>
                <label style={{fontSize:12,color:"#6B7280",display:"block",marginBottom:4}}>Company email</label>
                <input autoFocus style={{width:"100%",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px 12px",fontSize:13,boxSizing:"border-box"}} placeholder="you@etoro.com" value={email} onChange={function(e){setEmail(e.target.value);setError("");}} onKeyDown={function(e){if(e.key==="Enter")handleEmailNext();}}/>
              </div>
              <button onClick={handleEmailNext} style={{background:"#111827",color:"#fff",fontSize:14,fontWeight:600,border:"none",borderRadius:9,padding:"12px",cursor:"pointer"}}>Continue</button>
              <div style={{fontSize:11,color:"#9CA3AF",textAlign:"center",lineHeight:1.6}}>Internal team members will be asked for their PIN. All other eToro emails get Requester access.</div>
              <div style={{borderTop:"1px solid #F3F4F6",paddingTop:12,fontSize:11,color:"#9CA3AF"}}>
                <div style={{fontWeight:600,marginBottom:6,color:"#6B7280"}}>Quick login (demo):</div>
                {[["omar.p@etoro.com","Operations","1001"],["layla.m@etoro.com","AML","2001"],["chris.b@etoro.com","Middle Office","3001"],["james.h@etoro.com","Trading","4001"],["madonama@etoro.com","Admin","0000"]].map(function(u) {
                  return (
                    <div key={u[0]} onClick={function(){setEmail(u[0]);}} style={{display:"flex",justifyContent:"space-between",padding:"4px 7px",borderRadius:6,cursor:"pointer",marginBottom:2,background:"#F9FAFB",border:"1px solid #F3F4F6"}}>
                      <span style={{color:"#374151"}}>{u[0]}</span>
                      <span style={{color:ROLE_COLOR[u[1]]||"#374151",fontWeight:600,fontSize:10}}>{u[1]} - PIN: {u[2]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {step==="pin"&&matchedUser&&(
            <div style={{display:"flex",flexDirection:"column",gap:16,alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,alignSelf:"stretch"}}>
                <button onClick={function(){setStep("email");setPin("");setError("");setMatchedUser(null);}} style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF",fontSize:18,padding:0}}>{"<"}</button>
                <div style={{flex:1,display:"flex",justifyContent:"center"}}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:ROLE_COLOR[(matchedUser.roles&&matchedUser.roles[0])||matchedUser.role]||"#374151",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700}}>{matchedUser.name.split(" ").map(function(w){return w[0];}).join("").toUpperCase().slice(0,2)}</div>
                </div>
                <div style={{width:18}}/>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:14,fontWeight:700,color:"#111827"}}>{matchedUser.name}</div>
                <div style={{fontSize:11,color:ROLE_COLOR[matchedUser.roles?matchedUser.roles[0]:matchedUser.role],fontWeight:600,marginTop:2}}>{matchedUser.roles?matchedUser.roles.join(" + "):matchedUser.role}</div>
                <div style={{fontSize:12,color:"#6B7280",marginTop:4}}>Enter your PIN</div>
              </div>
              <input autoFocus type="tel" inputMode="numeric" value={pin} onChange={function(e){var val=e.target.value.replace(/\D/g,"");if(val.length>matchedUser.pin.length)return;setPin(val);setError("");if(val.length===matchedUser.pin.length){setTimeout(function(){verifyPin(val);},120);}}} style={{position:"absolute",opacity:0,width:1,height:1,pointerEvents:"none"}}/>
              <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                {Array.from({length:matchedUser.pin.length}).map(function(_,i) {
                  return <div key={i} style={{width:16,height:16,borderRadius:"50%",background:i<pin.length?"#111827":"#E5E7EB",border:"2px solid "+(i<pin.length?"#111827":"#D1D5DB")}}/>;
                })}
              </div>
              {error&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"7px 12px",fontSize:12,color:"#DC2626",textAlign:"center",width:"100%",boxSizing:"border-box"}}>{error}</div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,width:"100%"}}>
                {digits.map(function(d,i) {
                  if(d==="")return <div key={i}/>;
                  return (
                    <button key={i} onClick={function() {
                      if(d==="<"){setPin(function(pp){return pp.slice(0,-1);});setError("");}
                      else{handlePinDigit(d);}
                    }} style={{padding:"16px 0",fontSize:d==="<"?18:20,fontWeight:d==="<"?400:600,border:"1px solid #E5E7EB",borderRadius:10,background:"#F9FAFB",cursor:"pointer",color:"#111827"}}>{d}</button>
                  );
                })}
              </div>
              <div style={{fontSize:11,color:"#9CA3AF"}}>Type on keyboard or tap digits above.</div>
            </div>
          )}
          {step==="name"&&matchedUser&&(
            <div style={{display:"flex",flexDirection:"column",gap:16,alignItems:"center"}}>
              <div style={{width:48,height:48,borderRadius:"50%",background:"#16A34A",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>OK</div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:14,fontWeight:700,color:"#111827"}}>PIN verified</div>
                <div style={{fontSize:12,color:"#6B7280",marginTop:4}}>Enter your name for audit attribution.</div>
              </div>
              {error&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"7px 12px",fontSize:12,color:"#DC2626",textAlign:"center",width:"100%",boxSizing:"border-box"}}>{error}</div>}
              <div style={{width:"100%"}}>
                <label style={{fontSize:12,color:"#6B7280",display:"block",marginBottom:4}}>Your full name</label>
                <input autoFocus style={{width:"100%",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px 12px",fontSize:14,boxSizing:"border-box",textAlign:"center"}} placeholder="e.g. Sara Johnson" value={displayName} onChange={function(e){setDisplayName(e.target.value);setError("");}} onKeyDown={function(e){if(e.key==="Enter")handleNameSubmit();}}/>
              </div>
              <button onClick={handleNameSubmit} style={{width:"100%",background:displayName.trim()?"#111827":"#D1D5DB",color:"#fff",fontSize:14,fontWeight:600,border:"none",borderRadius:9,padding:"12px",cursor:displayName.trim()?"pointer":"not-allowed"}}>Enter dashboard</button>
              <div style={{fontSize:11,color:"#9CA3AF",textAlign:"center"}}>Signing in as {matchedUser.roles?matchedUser.roles.join(" + "):matchedUser.role}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  var [user,setUser]=useState(null);
  var [tab,setTab]=useState(null);

  // ── localStorage persistence ──────────────────────────────────
  // Load cases from localStorage on first render, fall back to SEED
  var [cases,setCasesRaw]=useState(function(){
    try{
      var saved=localStorage.getItem("acatout_cases");
      if(saved){var parsed=JSON.parse(saved);if(Array.isArray(parsed)&&parsed.length>0)return parsed;}
    }catch(e){}
    return SEED;
  });

  // Load permissions from localStorage, fall back to DEFAULT_PERMISSIONS
  var [permissions,setPermissionsRaw]=useState(function(){
    try{
      var saved=localStorage.getItem("acatout_permissions");
      if(saved){var parsed=JSON.parse(saved);if(Array.isArray(parsed)&&parsed.length>0)return parsed;}
    }catch(e){}
    return DEFAULT_PERMISSIONS;
  });

  // Wrap setters to also persist to localStorage
  function setCases(updater){
    setCasesRaw(function(prev){
      var next=typeof updater==="function"?updater(prev):updater;
      try{localStorage.setItem("acatout_cases",JSON.stringify(next));}catch(e){}
      return next;
    });
  }
  function setPermissions(updater){
    setPermissionsRaw(function(prev){
      var next=typeof updater==="function"?updater(prev):updater;
      try{localStorage.setItem("acatout_permissions",JSON.stringify(next));}catch(e){}
      return next;
    });
  }
  // ─────────────────────────────────────────────────────────────

  function handleLogin(u) {
    var fresh=null;
    for(var i=0;i<permissions.length;i++){if(permissions[i].email.toLowerCase()===u.email.toLowerCase()){fresh=permissions[i];break;}}
    var access=fresh?resolveUserAccess(fresh):{primary:"Requester",roles:["Requester"],tabs:TAB_MAP.Requester,queueStages:ROLE_QUEUE_STAGES.Requester||[],visibleStages:ROLE_VISIBLE_STAGES.Requester};
    var resolved={id:u.email,name:u.name,email:u.email,role:access.primary,roles:access.roles,tabs:access.tabs,queueStages:access.queueStages,visibleStages:access.visibleStages};
    if(u.accountName)resolved.accountName=u.accountName;
    setUser(resolved);
    setTab(access.tabs[0]);
  }

  if(!user)return <LoginScreen onLogin={handleLogin} permissions={permissions}/>;

  var tabs=user.tabs||(TAB_MAP[user.role]||TAB_MAP.Requester);
  var myQueueStages=user.queueStages||(ROLE_QUEUE_STAGES[user.role]||[]);
  var pendingMe=cases.filter(function(c){return myQueueStages.includes(c.status);}).length;

  return (
    <div style={{fontFamily:"system-ui,sans-serif",padding:16,maxWidth:1000,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div>
          <div style={{fontSize:17,fontWeight:700,color:"#111827"}}>Transfers Hub</div>
          <div style={{fontSize:12,color:"#9CA3AF"}}>{cases.filter(function(c){return !["Completed","Rejected"].includes(c.status);}).length} active - {cases.filter(function(c){return c.status==="Completed";}).length} completed</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{display:"flex",alignItems:"center",gap:8,background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:10,padding:"6px 12px"}}>
            <Avatar name={user.name} role={user.role} size={28}/>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"#111827"}}>{user.name}</div>
              <div style={{fontSize:10,fontWeight:600,color:ROLE_COLOR[user.role]||"#374151"}}>
                {(user.roles&&user.roles.length>1)?user.roles.join(" + "):user.role}
              </div>
            </div>
          </div>
          <button onClick={function(){setUser(null);setTab(null);}} style={{fontSize:12,border:"1px solid #E5E7EB",borderRadius:8,padding:"6px 11px",cursor:"pointer",background:"#fff",color:"#6B7280"}}>Sign out</button>
        </div>
      </div>
      <div style={{display:"flex",borderBottom:"2px solid #F3F4F6",marginBottom:16,overflowX:"auto"}}>
        {tabs.map(function(t) {
          var badge=t==="My Queue"&&pendingMe>0?" ("+pendingMe+")":"";
          return <button key={t} onClick={function(){setTab(t);}} style={{fontSize:13,padding:"8px 14px",border:"none",borderBottom:"2px solid "+(tab===t?"#111827":"transparent"),marginBottom:-2,cursor:"pointer",background:"transparent",color:tab===t?"#111827":"#9CA3AF",fontWeight:tab===t?600:400,whiteSpace:"nowrap"}}>{t}{badge}</button>;
        })}
      </div>
      <div>
        {tab==="🏠 Home"    && <OverviewTab cases={cases} user={user}/>}
        {tab==="My Requests" && <MyRequestsTab cases={cases} setCases={setCases} user={user}/>}
        {tab==="New Request" && <NewRequestTab cases={cases} setCases={setCases} user={user}/>}
        {tab==="My Queue"    && <QueueTab cases={cases} setCases={setCases} user={user} permissions={permissions}/>}
        {tab==="All Cases"   && <AllCasesTab cases={cases} setCases={setCases} user={user} permissions={permissions}/>}
        {tab==="Raw Data"    && <RawDataTab cases={cases} user={user}/>}
        {tab==="Execution"   && <ExecutionTab cases={cases} setCases={setCases}/>}
        {tab==="Reports"     && <ReportsTab cases={cases}/>}
        {tab==="Permissions" && <PermissionManager permissions={permissions} setPermissions={setPermissions}/>}
      </div>
    </div>
  );
}


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

