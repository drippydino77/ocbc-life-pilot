// Expense entry + OCR receipt parsing

async function saveExpense(){
  const amount=Number($("amount").value||0), merchant=$("merchant").value.trim()||"Unknown", category=$("category").value, date=$("date").value||new Date().toISOString().slice(0,10);
  if(!amount) return toast("Missing amount","Enter an amount first.");
  learnMerchantCorrection();
  const expense={amount,merchant,category,date,source:"manual",ts:Date.now()};
  await saveExpenseToSupabase(expense);
  state.tx.unshift(expense);
  const msg=`${category} spending logged: ${merchant} ${money(amount)}.`;
  state.feed.unshift(["Now",msg]); await saveFeedToSupabase(msg);
  saveLocal(); renderApp(); showTab("home"); runNotificationEngine(true); toast("Expense saved",`${merchant} was added.`);
  $("amount").value=""; $("merchant").value="";
}


// v6 OCR Intelligence Engine
const merchantDirectory = [
  // Food and drinks
  {name:"Guzman y Gomez", aliases:["guzman y gomez","guzman","gyg","guzman y gomez singapore"], category:"Food & Dining"},
  {name:"McDonald's", aliases:["mcdonald","macdonald","mcdonalds","mc donald","mcd","golden arches"], category:"Food & Dining"},
  {name:"KFC", aliases:["kfc","kentucky fried chicken"], category:"Food & Dining"},
  {name:"Burger King", aliases:["burger king","bk singapore"], category:"Food & Dining"},
  {name:"Subway", aliases:["subway"], category:"Food & Dining"},
  {name:"Jollibee", aliases:["jollibee"], category:"Food & Dining"},
  {name:"Popeyes", aliases:["popeyes"], category:"Food & Dining"},
  {name:"Texas Chicken", aliases:["texas chicken"], category:"Food & Dining"},
  {name:"Five Guys", aliases:["five guys"], category:"Food & Dining"},
  {name:"Shake Shack", aliases:["shake shack"], category:"Food & Dining"},

  {name:"Starbucks", aliases:["starbucks","star bucks"], category:"Food & Dining"},
  {name:"The Coffee Bean & Tea Leaf", aliases:["coffee bean","the coffee bean","cbtl"], category:"Food & Dining"},
  {name:"Toast Box", aliases:["toast box"], category:"Food & Dining"},
  {name:"Ya Kun", aliases:["ya kun","yakun","ya kun kaya toast"], category:"Food & Dining"},
  {name:"LiHO", aliases:["liho","liho tea"], category:"Food & Dining"},
  {name:"KOI", aliases:["koi","koi the","koi cafe"], category:"Food & Dining"},
  {name:"Gong Cha", aliases:["gong cha","gongcha"], category:"Food & Dining"},
  {name:"Mr Coconut", aliases:["mr coconut","mrcoconut"], category:"Food & Dining"},
  {name:"CHICHA San Chen", aliases:["chicha","chicha san chen"], category:"Food & Dining"},
  {name:"Boost Juice", aliases:["boost","boost juice"], category:"Food & Dining"},
  {name:"Luckin Coffee", aliases:["luckin","luckin coffee"], category:"Food & Dining"},
  {name:"Old Chang Kee", aliases:["old chang kee","ock"], category:"Food & Dining"},
  {name:"BreadTalk", aliases:["breadtalk","bread talk"], category:"Food & Dining"},
  {name:"Four Leaves", aliases:["four leaves"], category:"Food & Dining"},
  {name:"Paris Baguette", aliases:["paris baguette"], category:"Food & Dining"},

  {name:"Koufu", aliases:["koufu"], category:"Food & Dining"},
  {name:"Kopitiam", aliases:["kopitiam"], category:"Food & Dining"},
  {name:"Food Republic", aliases:["food republic"], category:"Food & Dining"},
  {name:"Foodfare", aliases:["foodfare","ntuc foodfare"], category:"Food & Dining"},
  {name:"Encik Tan", aliases:["encik tan"], category:"Food & Dining"},
  {name:"Saizeriya", aliases:["saizeriya"], category:"Food & Dining"},
  {name:"Din Tai Fung", aliases:["din tai fung","dintaifung"], category:"Food & Dining"},
  {name:"Pepper Lunch", aliases:["pepper lunch"], category:"Food & Dining"},
  {name:"PastaMania", aliases:["pastamania","pasta mania"], category:"Food & Dining"},
  {name:"Sukiya", aliases:["sukiya"], category:"Food & Dining"},
  {name:"Ajisen", aliases:["ajisen"], category:"Food & Dining"},
  {name:"Ichiban Sushi", aliases:["ichiban","ichiban sushi"], category:"Food & Dining"},
  {name:"Monster Curry", aliases:["monster curry"], category:"Food & Dining"},
  {name:"Wingstop", aliases:["wingstop","wing stop"], category:"Food & Dining"},
  {name:"Collin's", aliases:["collin","collins","collin's"], category:"Food & Dining"},

  // Groceries/convenience
  {name:"FairPrice", aliases:["fairprice","ntuc","ntuc fairprice"], category:"Groceries"},
  {name:"Sheng Siong", aliases:["sheng siong","shengsiong"], category:"Groceries"},
  {name:"Giant", aliases:["giant"], category:"Groceries"},
  {name:"Cold Storage", aliases:["cold storage"], category:"Groceries"},
  {name:"Don Don Donki", aliases:["don don donki","donki","don don"], category:"Groceries"},
  {name:"7-Eleven", aliases:["7-eleven","7 eleven","seven eleven"], category:"Groceries"},
  {name:"Cheers", aliases:["cheers"], category:"Groceries"},

  // Transport
  {name:"Grab", aliases:["grab","grabpay","grab ride"], category:"Transport"},
  {name:"Gojek", aliases:["gojek","go jek"], category:"Transport"},
  {name:"ComfortDelGro", aliases:["comfortdelgro","comfort","cdg","comfort taxi"], category:"Transport"},
  {name:"TADA", aliases:["tada"], category:"Transport"},
  {name:"Ryde", aliases:["ryde"], category:"Transport"},
  {name:"SimplyGo", aliases:["simplygo","simply go"], category:"Transport"},
  {name:"EZ-Link", aliases:["ez-link","ezlink","ez link"], category:"Transport"},
  {name:"MRT", aliases:["mrt","smrt","sbs transit"], category:"Transport"},

  // Shopping / retail
  {name:"Shopee", aliases:["shopee"], category:"Shopping"},
  {name:"Lazada", aliases:["lazada"], category:"Shopping"},
  {name:"Amazon", aliases:["amazon"], category:"Shopping"},
  {name:"Qoo10", aliases:["qoo10"], category:"Shopping"},
  {name:"Uniqlo", aliases:["uniqlo"], category:"Shopping"},
  {name:"Cotton On", aliases:["cotton on"], category:"Shopping"},
  {name:"Zara", aliases:["zara"], category:"Shopping"},
  {name:"H&M", aliases:["h&m","h m"], category:"Shopping"},
  {name:"Watsons", aliases:["watsons","watson"], category:"Shopping"},
  {name:"Guardian", aliases:["guardian"], category:"Shopping"},
  {name:"Popular", aliases:["popular bookstore","popular"], category:"Shopping"},
  {name:"Challenger", aliases:["challenger"], category:"Shopping"},
  {name:"Courts", aliases:["courts"], category:"Shopping"},
  {name:"IKEA", aliases:["ikea"], category:"Shopping"},
  {name:"Decathlon", aliases:["decathlon"], category:"Shopping"},

  // Subscriptions / bills
  {name:"Spotify", aliases:["spotify"], category:"Subscriptions"},
  {name:"Netflix", aliases:["netflix"], category:"Subscriptions"},
  {name:"YouTube", aliases:["youtube","youtube premium"], category:"Subscriptions"},
  {name:"Disney+", aliases:["disney","disney+"], category:"Subscriptions"},
  {name:"Apple", aliases:["apple","icloud","apple.com/bill"], category:"Subscriptions"},
  {name:"Google", aliases:["google","google play"], category:"Subscriptions"},
  {name:"Microsoft", aliases:["microsoft","xbox"], category:"Subscriptions"},
  {name:"Anytime Fitness", aliases:["anytime fitness"], category:"Subscriptions"},
  {name:"ActiveSG", aliases:["active sg","activesg"], category:"Subscriptions"},

  {name:"Singtel", aliases:["singtel"], category:"Bills"},
  {name:"StarHub", aliases:["starhub","star hub"], category:"Bills"},
  {name:"M1", aliases:["m1 limited","m1"], category:"Bills"},
  {name:"Circles.Life", aliases:["circles","circles.life"], category:"Bills"},
  {name:"SP Services", aliases:["sp services","sp group","utilities"], category:"Bills"}
];

const categoryKeywordRules = [
  {category:"Food & Dining", words:["latte","coffee","tea","burger","meal","chicken","rice","noodle","ramen","pasta","taco","burrito","fries","drink","kopi","teh","dining","restaurant","cafe"]},
  {category:"Transport", words:["top up","bus","mrt","taxi","ride","trip","fare","transport","ezlink","simplygo"]},
  {category:"Groceries", words:["grocery","groceries","supermarket","fresh","milk","bread","eggs","vegetable","fruit"]},
  {category:"Shopping", words:["retail","shirt","pants","shoes","apparel","cosmetic","pharmacy","store","mall"]},
  {category:"Subscriptions", words:["subscription","monthly","membership","renewal","premium","plan"]},
  {category:"Bills", words:["bill","utility","utilities","telco","mobile","electricity","water"]}
];

function normalizeOCRText(s){
  return (s||"").toLowerCase()
    .replace(/0/g,"o")
    .replace(/1/g,"i")
    .replace(/5/g,"s")
    .replace(/[^\w\s&.'+-]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function levenshtein(a,b){
  a=normalizeOCRText(a); b=normalizeOCRText(b);
  const dp=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
  for(let i=0;i<=a.length;i++) dp[i][0]=i;
  for(let j=0;j<=b.length;j++) dp[0][j]=j;
  for(let i=1;i<=a.length;i++){
    for(let j=1;j<=b.length;j++){
      const cost=a[i-1]===b[j-1]?0:1;
      dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+cost);
    }
  }
  return dp[a.length][b.length];
}

function similarity(a,b){
  a=normalizeOCRText(a); b=normalizeOCRText(b);
  const max=Math.max(a.length,b.length);
  if(!max) return 1;
  return 1 - levenshtein(a,b)/max;
}

function getLearnedCorrections(){
  try{return JSON.parse(localStorage.getItem("lifepilot_merchant_learning")||"{}");}
  catch(e){return {};}
}

function learnMerchantCorrection(){
  const raw=($("ocrText")?.value||"").slice(0,160).trim();
  const merchant=($("merchant")?.value||"").trim();
  const category=($("category")?.value||"").trim();
  if(!raw || !merchant) return;
  const key=normalizeOCRText(raw).split(" ").slice(0,6).join(" ");
  const learned=getLearnedCorrections();
  learned[key]={merchant,category};
  localStorage.setItem("lifepilot_merchant_learning",JSON.stringify(learned));
}

// ── Personal merchant rules (modal + "My Merchants" list) ───────────
// A "rule" is just a learned correction the user enters by hand. It is
// stored in the same localStorage bucket detectMerchantAdvanced() reads,
// keyed by the normalized merchant name so future receipts whose text
// contains that name resolve straight to the user's category.

function openMerchantRuleModal(){
  // Prefill from the current expense form when opened from the OCR box.
  const m=($("merchant")?.value||"").trim();
  const c=($("category")?.value||"").trim();
  if($("ruleMerchant")) $("ruleMerchant").value=m;
  if($("ruleCategory") && c){
    const opts=[...$("ruleCategory").options].map(o=>o.value);
    $("ruleCategory").value=opts.includes(c)?c:"Others";
  }
  if($("ruleCustomCategory")) $("ruleCustomCategory").value="";
  if($("ruleNotes")) $("ruleNotes").value="";
  $("merchantRuleModal").classList.remove("hidden");
}

function closeMerchantRuleModal(){
  $("merchantRuleModal").classList.add("hidden");
}

function saveMerchantRule(){
  const merchant=($("ruleMerchant")?.value||"").trim();
  const custom=($("ruleCustomCategory")?.value||"").trim();
  const category=custom || ($("ruleCategory")?.value||"Others");
  const notes=($("ruleNotes")?.value||"").trim();
  if(!merchant) return toast("Missing merchant","Enter a merchant name or description first.");
  const key=normalizeOCRText(merchant);
  if(!key) return toast("Invalid merchant","Enter a recognisable merchant name.");
  const learned=getLearnedCorrections();
  learned[key]={merchant,category,notes,manual:true};
  localStorage.setItem("lifepilot_merchant_learning",JSON.stringify(learned));
  closeMerchantRuleModal();
  renderMerchantRules();
  toast("Rule saved",`${merchant} → ${category}. Lumi will use this on your receipts.`);
}

function deleteMerchantRule(encodedKey){
  const key=decodeURIComponent(encodedKey);
  const learned=getLearnedCorrections();
  if(key in learned){
    delete learned[key];
    localStorage.setItem("lifepilot_merchant_learning",JSON.stringify(learned));
    renderMerchantRules();
    toast("Rule removed","That merchant rule was deleted.");
  }
}

function renderMerchantRules(){
  const box=$("merchantRuleList"); if(!box) return;
  const learned=getLearnedCorrections();
  const keys=Object.keys(learned);
  if(!keys.length){
    box.innerHTML="<p>No personal merchant rules yet. Save one from a scanned receipt or the + button above.</p>";
    return;
  }
  box.innerHTML=keys.map(k=>{
    const r=learned[k]||{};
    const name=r.merchant||k;
    const note=r.notes?` • ${r.notes}`:"";
    const origin=r.manual?"":" • auto-learned";
    return `<div class="rule-item"><div><b>${name}</b><small>${r.category||"Others"}${note}${origin}</small></div>`+
      `<div class="rule-actions"><button title="Delete rule" onclick="deleteMerchantRule('${encodeURIComponent(k)}')">✕</button></div></div>`;
  }).join("");
}

// "Edit detected fields" → jump to the manual expense form and focus it.
function focusExpenseFields(){
  showTab("add");
  const amt=$("amount");
  if(amt){ amt.focus(); amt.scrollIntoView({behavior:"smooth",block:"center"}); }
}

function detectMerchantAdvanced(text){
  const lower=normalizeOCRText(text);
  const learned=getLearnedCorrections();

  for(const key in learned){
    if(key && lower.includes(key)){
      return {merchant:learned[key].merchant,category:learned[key].category||"Others",confidence:94,source:"learned"};
    }
  }

  let best=null;
  for(const merchant of merchantDirectory){
    for(const alias of merchant.aliases){
      const cleanAlias=normalizeOCRText(alias);
      if(lower.includes(cleanAlias)){
        const score=0.92 + Math.min(0.07, cleanAlias.length/200);
        if(!best || score>best.score) best={merchant:merchant.name,category:merchant.category,score,source:"exact"};
      }
    }
  }

  const words=lower.split(" ");
  const windows=[];
  for(let size=1; size<=4; size++){
    for(let i=0;i<=words.length-size;i++) windows.push(words.slice(i,i+size).join(" "));
  }

  for(const merchant of merchantDirectory){
    for(const alias of merchant.aliases){
      const cleanAlias=normalizeOCRText(alias);
      for(const w of windows){
        if(Math.abs(w.length-cleanAlias.length)>5) continue;
        const sim=similarity(w,cleanAlias);
        if(sim>=0.78 && (!best || sim>best.score)){
          best={merchant:merchant.name,category:merchant.category,score:sim,source:"fuzzy"};
        }
      }
    }
  }

  if(best){
    return {merchant:best.merchant,category:best.category,confidence:Math.round(best.score*100),source:best.source};
  }

  for(const rule of categoryKeywordRules){
    if(rule.words.some(w=>lower.includes(w))){
      return {merchant:"Unknown Merchant",category:rule.category,confidence:58,source:"keyword"};
    }
  }

  return {merchant:"Receipt Upload",category:"Others",confidence:42,source:"fallback"};
}

function extractReceiptFields(text){
  const raw=(text||"").replace(/\s+/g," ").trim();
  const lower=normalizeOCRText(raw);

  let amount=null;
  const amountPatterns=[
    /(?:grand\s*total|total\s*amount|amount\s*paid|total|net\s*total|balance\s*due|paid)[^0-9]{0,35}(?:s\$|\$|sgd)?\s*([0-9]{1,4}[.,][0-9]{2})/i,
    /(?:visa|mastercard|paynow|cash|nets|amex)[^0-9]{0,35}(?:s\$|\$|sgd)?\s*([0-9]{1,4}[.,][0-9]{2})/i
  ];
  for(const p of amountPatterns){
    const m=raw.match(p);
    if(m){amount=Number(m[1].replace(",","."));break;}
  }
  if(amount===null){
    const vals=[...raw.matchAll(/(?:s\$|\$|sgd)?\s*([0-9]{1,4}[.,][0-9]{2})/gi)]
      .map(m=>Number(m[1].replace(",",".")))
      .filter(n=>!isNaN(n)&&n>0&&n<5000);
    if(vals.length) amount=Math.max(...vals);
  }

  let date=null;
  const dateMatch=raw.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/);
  if(dateMatch) date=dateMatch[1];

  let payment="Unknown";
  if(/paynow/i.test(raw)) payment="PayNow";
  else if(/nets/i.test(raw)) payment="NETS";
  else if(/visa/i.test(raw)) payment="Visa";
  else if(/mastercard/i.test(raw)) payment="Mastercard";
  else if(/cash/i.test(raw)) payment="Cash";
  else if(/amex/i.test(raw)) payment="AMEX";

  let cardLast4=null;
  const cardMatch=raw.match(/(?:\*{2,}|x{2,}|ending|card)[^\d]{0,10}(\d{4})\b/i);
  if(cardMatch) cardLast4=cardMatch[1];

  return {amount,date,payment,cardLast4};
}

function parseReceiptText(raw){
  const merchantInfo=detectMerchantAdvanced(raw);
  const fields=extractReceiptFields(raw);
  let confidence=merchantInfo.confidence;
  if(fields.amount) confidence += 8;
  if(fields.payment !== "Unknown") confidence += 4;
  if(fields.date) confidence += 3;
  confidence=Math.min(99,confidence);

  return {
    merchant:merchantInfo.merchant,
    category:merchantInfo.category,
    amount:fields.amount,
    dateDetected:fields.date,
    payment:fields.payment,
    cardLast4:fields.cardLast4,
    confidence,
    source:merchantInfo.source
  };
}

function handleReceiptImage(event,mode){
  const file=event.target.files&&event.target.files[0]; if(!file) return;
  $("receiptPreview").src=URL.createObjectURL(file); $("receiptPreview").style.display="block"; $("ocrText").style.display="block"; $("ocrText").value="";
  $("ocrStatus").textContent=mode==="camera"?"Camera image received. Reading receipt...":"Uploaded image received. Reading receipt...";
  if(typeof Tesseract==="undefined") return toast("OCR unavailable","Internet is needed for OCR library.");
  Tesseract.recognize(file,"eng",{logger:m=>{if(m.status) $("ocrStatus").textContent="OCR: "+m.status+(m.progress?" "+Math.round(m.progress*100)+"%":"");}})
  .then(result=>{
    const text=(result.data.text||"").trim(); $("ocrText").value=text;
    const parsed=parseReceiptText(text);
    if($("ocrConfirmBox")) $("ocrConfirmBox").classList.remove("hidden");
    if($("ocrMerchantOut")) $("ocrMerchantOut").textContent=parsed.merchant||"Unknown";
    if($("ocrAmountOut")) $("ocrAmountOut").textContent=parsed.amount?money(parsed.amount):"Check";
    if($("ocrCategoryOut")) $("ocrCategoryOut").textContent=parsed.category||"Others";
    if($("ocrConfidenceOut")) $("ocrConfidenceOut").textContent=(parsed.confidence||0)+"%";
    if($("ocrDateOut")) $("ocrDateOut").textContent=parsed.dateDetected||"Not found";
    if($("ocrPaymentOut")) $("ocrPaymentOut").textContent=parsed.payment||"Unknown";
    if($("ocrSuggestionBox")){
      $("ocrSuggestionBox").classList.remove("hidden");
      $("ocrSuggestionBox").innerHTML=`Detected using <b>${parsed.source||"OCR"}</b> matching. You can correct it below and LifePilot will remember similar receipts on this device.`;
    }
    if($("ocrConfirmBox")) $("ocrConfirmBox").classList.remove("hidden");
    if($("ocrMerchantOut")) $("ocrMerchantOut").textContent=parsed.merchant||"Unknown";
    if($("ocrAmountOut")) $("ocrAmountOut").textContent=parsed.amount?money(parsed.amount):"Check";
    if($("ocrCategoryOut")) $("ocrCategoryOut").textContent=parsed.category||"Others";
    if($("ocrConfidenceOut")) $("ocrConfidenceOut").textContent=(parsed.confidence||0)+"%";
    $("amount").value=parsed.amount?parsed.amount.toFixed(2):"";
    $("merchant").value=parsed.merchant||"Receipt Upload";
    $("category").value=parsed.category||"Others";
    $("ocrStatus").innerHTML=`Detected <b>${parsed.merchant||"Unknown merchant"}</b>, likely <b>${parsed.category}</b>, amount <b>${parsed.amount?money(parsed.amount):"not found"}</b>. Confirm before saving.`;
    toast("Receipt scanned", parsed.amount?`Detected ${money(parsed.amount)} • ${parsed.category}`:"Text found, amount needs check.");
  }).catch(err=>{console.error(err); $("ocrStatus").textContent="OCR failed. Try a clearer image or enter manually."; toast("OCR failed","Try better lighting.");});
}


function guessCategory(lower){
  const groups={"Food & Dining":["starbucks","mcdonald","kfc","subway","kopitiam","koufu","food","cafe","coffee","restaurant","toast","yakun","ya kun","liho","burger","dining"],"Transport":["grab","gojek","comfort","taxi","mrt","bus","transport","ez-link","ezlink","simplygo"],"Shopping":["shopee","lazada","uniqlo","cotton on","zara","shopping","mall","popular"],"Subscriptions":["spotify","netflix","subscription","icloud","youtube","disney","gym"],"Bills":["singtel","starhub","m1","sp services","utilities","bill","electricity","water"]};
  for(const [cat,words] of Object.entries(groups)) if(words.some(w=>lower.includes(w))) return cat;
  return "Others";
}
