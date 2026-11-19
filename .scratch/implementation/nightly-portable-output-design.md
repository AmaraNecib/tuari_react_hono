# Export the checked ZIP path

Base4f0e7fc7c469bef81eace3f0ec6b26d77ff641b2. Owner authorizes autonomous build repair. Modefocused-local/CI-final-enforced; light parent inspection and Greptile, all hosted merge gates retained.

Nightly44615864452 confirms proof child6908closed0beforecandidatepublication and WindowsShellseesTuari.exe/bin. Manifest step then received an empty portable output. The Shell step checked LASTEXITCODE after calling a PowerShell script, not a native command. In a fresh shell LASTEXITCODE is null, null-ne0 istrue, and exitnull returns before GITHUB_OUTPUT write. Successful step therefore exported nothing.

Use terminating PowerShell error handling for the PowerShell script invocation. Remove the native exit-code check and always write the selected path only after script success. No ZIP reselection or gate removal. Native proof/extraction/crypto logic unchanged.

An integration regression replays the actual workflow run body with LASTEXITCODE explicitly null, a real packaged ZIP visible in Shell, and a dedicated GITHUB_OUTPUT file. It asserts the exact selected archive path was exported. Parent case passed1/1 in6.176s;12workflowtests passed;actionlint/diff0. Initial testfilter accidentally selected no intendedintegrationcase and is not counted asproof; actualfilter replay log .scratch/sessions/nightly-output-replay-actual.log is authoritative. Existing Windows CI must run this ZIP integrationcase aswell as lifecyclecase so wiring cannot silentlyregress. No new Node/deps/version/stableRelease. Originalpersistentholderexclusivecause remainsuncertain but newrun confirmsproofchildclosure/renamepassed.
