# Idempotent GitHub metadata sync for Factor-easyPro's approved roadmap.
# Does not change repository security rules, collaborators or release permissions.
# Usage: GH_TOKEN with issues:write; GH_REPO (optional), otherwise GITHUB_REPOSITORY.
$ErrorActionPreference = 'Stop'
$repo = if ($env:GH_REPO) { $env:GH_REPO } else { $env:GITHUB_REPOSITORY }
if ($repo -ne 'davoodmehraban89/Factor-easyPro') {
  throw 'Unexpected repository. Roadmap metadata sync is limited to the designated repo.'
}
if (-not $env:GH_TOKEN) { throw 'Missing GH_TOKEN with issues:write permission' }

$phaseDefs = @(
  @{ Code='A'; Title='Phase A — Reliable Core'; Description='P0 accounting, immutable financial correction, audit, recovery, security and Windows acceptance.' }
  @{ Code='B'; Title='Phase B — Retail Pro'; Description='P1 POS, cashier shifts, multi-tender settlement, price tiers, orders and retail reporting. Starts after A approval.' }
  @{ Code='C'; Title='Phase C — Industry & Scale'; Description='P2/P3 manufacturing, distribution, assets, payroll, tax integrations and transactional multi-branch architecture. Starts after B approval.' }
)
$existingMilestones = @(gh api ("repos/{0}/milestones?state=all&per_page=100" -f $repo) | ConvertFrom-Json)
foreach ($phase in $phaseDefs) {
  $found = @($existingMilestones | Where-Object { $_.title -eq $phase.Title })
  if ($found.Count -gt 1) { throw ('Duplicate milestone name: ' + $phase.Title) }
  if ($found.Count -eq 0) {
    $newMilestone = gh api -X POST ("repos/{0}/milestones" -f $repo) -f ('title=' + $phase.Title) -f ('description=' + $phase.Description) | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $newMilestone.number) { throw ('Cannot create milestone ' + $phase.Code) }
    Write-Output ('CREATED_MILESTONE=' + $newMilestone.number + ' ' + $phase.Title)
  } else {
    Write-Output ('EXISTING_MILESTONE=' + $found[0].number + ' ' + $phase.Title)
  }
}

$labels = @(
  @{ Name='phase:A'; Color='d4c5f9'; Description='Reliability and financial core' },
  @{ Name='phase:B'; Color='a2eeef'; Description='Professional retail features' },
  @{ Name='phase:C'; Color='f9d0c4'; Description='Industry modules and scale' },
  @{ Name='priority:P0'; Color='b60205'; Description='Release-blocking financial integrity and safety' },
  @{ Name='priority:P1'; Color='d93f0b'; Description='High priority professional retail or operations' },
  @{ Name='priority:P2'; Color='fbca04'; Description='Planned later module' },
  @{ Name='priority:P3'; Color='c2e0c6'; Description='Optional specialized extension' },
  @{ Name='area:accounting'; Color='5319e7'; Description='Financial ledger and document lifecycle' },
  @{ Name='area:retail'; Color='0e8a16'; Description='Retail POS, ordering and price workflows' },
  @{ Name='area:inventory'; Color='1d76db'; Description='Inventory and warehouse valuation' },
  @{ Name='area:enterprise'; Color='006b75'; Description='Enterprise and manufacturing architecture' },
  @{ Name='area:operations'; Color='bfdadc'; Description='GitHub, CI, release and delivery operations' },
  @{ Name='area:security'; Color='e99695'; Description='Audit, permissions and licensing' },
  @{ Name='area:data'; Color='c5def5'; Description='Data integrity, backup and migrations' },
  @{ Name='type:epic'; Color='7057ff'; Description='Phase-level delivery epic' },
  @{ Name='type:design'; Color='fef2c0'; Description='Architecture decision record' },
  @{ Name='type:feature'; Color='84b6eb'; Description='Product feature to be implemented' },
  @{ Name='type:qa'; Color='d4e8c4'; Description='Acceptance and quality engineering' },
  @{ Name='type:security'; Color='ee0701'; Description='Security-critical change' },
  @{ Name='type:operations'; Color='ededed'; Description='Repository/CI management' },
  @{ Name='status:planned'; Color='e4e669'; Description='Planned; not an implemented feature' }
)
$existingLabels = @(gh api ("repos/{0}/labels?per_page=100" -f $repo) | ConvertFrom-Json)
foreach ($l in $labels) {
  if (@($existingLabels | Where-Object { $_.name -eq $l.Name }).Count -eq 0) {
    gh label create $l.Name --repo $repo --color $l.Color --description $l.Description
    if ($LASTEXITCODE -ne 0) { throw ('Cannot create label ' + $l.Name) }
    Write-Output ('CREATED_LABEL=' + $l.Name)
  }
}

# Phase, priority, functional ownership and type for existing canonical issues.
$assignments = @(
  @{ N=2; Phase='A'; P='P0'; Area='accounting'; Type='epic' }
  @{ N=3; Phase='B'; P='P1'; Area='retail'; Type='epic' }
  @{ N=4; Phase='C'; P='P2'; Area='enterprise'; Type='epic' }
  @{ N=5; Phase='A'; P='P0'; Area='accounting'; Type='design' }
  @{ N=7; Phase='A'; P='P0'; Area='data'; Type='feature' }
  @{ N=8; Phase='A'; P='P0'; Area='data'; Type='feature' }
  @{ N=9; Phase='A'; P='P0'; Area='accounting'; Type='feature' }
  @{ N=10; Phase='A'; P='P0'; Area='security'; Type='security' }
  @{ N=11; Phase='A'; P='P0'; Area='accounting'; Type='feature' }
  @{ N=12; Phase='A'; P='P0'; Area='security'; Type='security' }
  @{ N=13; Phase='A'; P='P0'; Area='operations'; Type='qa' }
  @{ N=14; Phase='A'; P='P0'; Area='operations'; Type='qa' }
  @{ N=15; Phase='B'; P='P1'; Area='retail'; Type='feature' }
  @{ N=16; Phase='B'; P='P1'; Area='retail'; Type='feature' }
  @{ N=17; Phase='C'; P='P2'; Area='enterprise'; Type='design' }
  @{ N=18; Phase='C'; P='P2'; Area='enterprise'; Type='design' }
  @{ N=19; Phase='A'; P='P0'; Area='operations'; Type='operations' }
  @{ N=20; Phase='A'; P='P1'; Area='operations'; Type='operations' }
)
foreach ($item in $assignments) {
  $phase = @($phaseDefs | Where-Object { $_.Code -eq $item.Phase })[0]
  $nameList = @('phase:'+$item.Phase,'priority:'+$item.P,'area:'+$item.Area,
    'type:'+$item.Type,'status:planned')
  gh issue edit $item.N --repo $repo --milestone $phase.Title --add-label ($nameList -join ',') 1>$null
  if ($LASTEXITCODE -ne 0) { throw ('Failed to assign issue #' + $item.N) }
  Write-Output ('ASSIGNED_ISSUE=' + $item.N + ' PHASE=' + $item.Phase)
}

# Verify the three phase epics and the first design issue against the remote API.
foreach ($item in @($assignments | Where-Object { $_.N -in @(2,3,4,5) })) {
  $issue = gh issue view $item.N --repo $repo --json milestone,labels | ConvertFrom-Json
  $phase = @($phaseDefs | Where-Object { $_.Code -eq $item.Phase })[0]
  $names = @($issue.labels | ForEach-Object { $_.name })
  if ($issue.milestone.title -ne $phase.Title -or
      $names -notcontains ('phase:' + $item.Phase) -or
      $names -notcontains ('priority:' + $item.P)) {
    throw ('Verification failed for issue #' + $item.N)
  }
}
Write-Output ('ROADMAP_METADATA_SYNC=SUCCESS;ISSUES=' + $assignments.Count + ';MILESTONES=' + $phaseDefs.Count)
