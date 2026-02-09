set lb to linefeed
set outPPT to POSIX file "/Users/aditiparvati/Desktop/Profound/Territory-Slicer-1 2/Strategy_Flow_Diagrams_Profound.pptx"
set outKEY to POSIX file "/Users/aditiparvati/Desktop/Profound/Territory-Slicer-1 2/Strategy_Flow_Diagrams_Profound.key"

tell application "Keynote"
  activate
  set theTheme to theme "White"
  set theDoc to make new document with properties {document theme:theTheme, width:1920, height:1080}

  set contentMaster to missing value
  repeat with ms in (master slides of theDoc)
    if (name of ms contains "Title & Bullets") then
      set contentMaster to ms
      exit repeat
    end if
  end repeat
  if contentMaster is missing value then set contentMaster to master slide 1 of theDoc

  set introBody to "How Pure ARR, ARR + Risk, and ARR + Geographic work" & lb & "for assignment decisions at Profound"
  set s1Body to "FLOW" & lb & "Start -> Sort accounts by ARR (high to low)" & lb & "-> For each account, check each rep's current total ARR" & lb & "-> Assign account to rep with lowest total ARR" & lb & "-> Update that rep total" & lb & "-> Repeat until all accounts assigned" & lb & lb & "WHY IT WORKS" & lb & "- Fast enough for live what-if changes" & lb & "- Easy to explain: biggest account to lightest book" & lb & "- Strong ARR balancing baseline"

  set s2Body to "FLOW" & lb & "Start with same ARR baseline cost per rep" & lb & "-> Is account high risk? (Risk_Score > threshold)" & lb & "-> If yes, adjust cost:" & lb & "   - Add penalty if rep already has high-risk concentration (>40%)" & lb & "   - Subtract bonus if rep has low high-risk concentration (<20%)" & lb & "-> Pick rep with lowest adjusted cost" & lb & "-> Update ARR + risk counters" & lb & lb & "WHY IT WORKS" & lb & "- Keeps ARR balanced" & lb & "- Prevents risk from piling on one rep" & lb & "- Still transparent and tunable"

  set s3Body to "FLOW" & lb & "Start with same ARR baseline cost per rep" & lb & "-> Compare account location to rep location" & lb & "-> If same state, subtract geo bonus from cost" & lb & "-> Pick rep with lowest adjusted cost" & lb & "-> Update ARR + same-state counters" & lb & lb & "WHY IT WORKS" & lb & "- Preserves ARR balance" & lb & "- Nudges local ownership and territory continuity" & lb & "- Reduces context switching for reps"

  set s4Body to "Shared Pattern Across Strategies" & lb & "Sort high ARR first -> compute per-rep cost -> assign lowest cost -> update stats" & lb & lb & "Business Fit" & lb & "- Millisecond-scale runtime for interactive planning" & lb & "- Deterministic and auditable for rep trust" & lb & "- Easy to layer business rules (risk/geo) without re-architecting"

  tell slide 1 of theDoc
    if exists default title item then set object text of default title item to "Territory Slicer: Strategy Flow Diagrams"
    if exists default body item then set object text of default body item to introBody
  end tell

  set s2 to make new slide at end of slides of theDoc with properties {base slide:contentMaster}
  tell s2
    if exists default title item then set object text of default title item to "1) Pure ARR Balance (Greedy / LPT)"
    if exists default body item then set object text of default body item to s1Body
  end tell

  set s3 to make new slide at end of slides of theDoc with properties {base slide:contentMaster}
  tell s3
    if exists default title item then set object text of default title item to "2) ARR + Risk Balance"
    if exists default body item then set object text of default body item to s2Body
  end tell

  set s4 to make new slide at end of slides of theDoc with properties {base slide:contentMaster}
  tell s4
    if exists default title item then set object text of default title item to "3) ARR + Geographic Clustering"
    if exists default body item then set object text of default body item to s3Body
  end tell

  set s5 to make new slide at end of slides of theDoc with properties {base slide:contentMaster}
  tell s5
    if exists default title item then set object text of default title item to "Why Greedy Backbone for Profound"
    if exists default body item then set object text of default body item to s4Body
  end tell

  save theDoc in outKEY
  export theDoc to outPPT as Microsoft PowerPoint
  close theDoc saving no
end tell
