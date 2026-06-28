/**
 * hostScript.jsx — ExtendScript bridge for Adobe Premiere Pro
 *
 * Called from the CEP panel via csInterface.evalScript('fn(args)', cb).
 * Return values must be JSON strings. Errors use { success: false, error: "..." }.
 */

// ─── Utilities ────────────────────────────────────────────────────────────────

function jsonOk(data) {
  return JSON.stringify({ success: true, data: data });
}

function jsonErr(msg) {
  return JSON.stringify({ success: false, error: String(msg) });
}

/**
 * Find a child bin by name, or create it.
 * Does NOT rely on ProjectItemType (it varies across PP versions).
 */
function findOrCreateBin(parent, name) {
  if (!parent || !parent.children) {
    return null;
  }
  try {
    for (var i = 0; i < parent.children.numItems; i++) {
      var child = parent.children[i];
      if (child && child.name === name) {
        // Verify it behaves like a bin (has a children collection)
        try { if (child.children !== undefined) return child; } catch (e) {}
      }
    }
  } catch (e) { /* fall through to createBin */ }

  try {
    return parent.createBin(name);
  } catch (e) {
    return null;
  }
}

// ─── initHost ─────────────────────────────────────────────────────────────────
// Called once when the panel mounts. Pre-enables the QE DOM so the one-time
// timeline UI refresh (which zooms-to-fit) happens at load time rather than
// mid-edit during a paste.

function initHost() {
  try {
    app.enableQE();
    return JSON.stringify({ success: true });
  } catch (e) {
    return jsonErr(e && e.message ? e.message : String(e));
  }
}

// ─── isProjectOpen ────────────────────────────────────────────────────────────

function isProjectOpen() {
  try {
    return (app && app.project && app.project.rootItem) ? 'true' : 'false';
  } catch (e) {
    return 'false';
  }
}

// ─── importFileToProject ──────────────────────────────────────────────────────

function importFileToProject(filePath, folderName) {
  try {

    // 1. Verify Premiere is running with a project open
    if (typeof app === 'undefined' || !app) {
      return jsonErr('app object not available in this context');
    }
    var project = app.project;
    if (!project) {
      return jsonErr('No project is open in Premiere Pro');
    }
    if (!project.rootItem) {
      return jsonErr('Project root item is not accessible');
    }

    // 2. Normalise path to Windows backslashes
    var normalizedPath = filePath.replace(/\//g, '\\');

    // 3. Verify the temp file actually exists on disk
    var file = new File(normalizedPath);
    if (!file.exists) {
      return jsonErr('Temp file not found: ' + normalizedPath);
    }

    // 4. Find / create "Instant Paste" → subfolder bins
    var rootBin = project.rootItem;

    var instantPasteBin = findOrCreateBin(rootBin, 'Instant Paste');
    if (!instantPasteBin) {
      return jsonErr('Could not find or create the "Instant Paste" bin');
    }

    var targetBin = findOrCreateBin(instantPasteBin, folderName || 'Images');
    if (!targetBin) {
      targetBin = instantPasteBin; // fallback: import into top-level bin
    }

    // 5. Import into the Project Panel
    //
    // IMPORTANT: project.importFiles() returns a BOOLEAN in most Premiere Pro
    // versions (not a collection). The imported item must be located by
    // inspecting targetBin's children before/after the call.
    var beforeCount = 0;
    try { beforeCount = targetBin.children.numItems; } catch (ce) { beforeCount = 0; }

    var importReturn;
    try {
      importReturn = project.importFiles([normalizedPath], true, targetBin, false);
    } catch (importErr) {
      return jsonErr('project.importFiles threw: ' + (importErr.message || String(importErr)));
    }

    var afterCount = 0;
    try { afterCount = targetBin.children.numItems; } catch (ce2) { afterCount = 0; }

    var importedItem = null;

    // (a) New child appeared in the target bin — the newest one is the import
    if (afterCount > beforeCount) {
      importedItem = targetBin.children[afterCount - 1];
    }

    // (b) Some versions DO return a collection/array — handle that too
    if (!importedItem && importReturn && typeof importReturn === 'object') {
      if (typeof importReturn.numItems !== 'undefined' && importReturn.numItems > 0) {
        importedItem = importReturn[0];
      } else if (typeof importReturn.length !== 'undefined' && importReturn.length > 0) {
        importedItem = importReturn[0];
      }
    }

    // (c) Last resort — match the imported file name against bin children
    if (!importedItem) {
      var baseName = normalizedPath.split('\\').pop();
      for (var k = 0; k < afterCount; k++) {
        var c = targetBin.children[k];
        if (c && c.name && (c.name === baseName || baseName.indexOf(c.name) === 0)) {
          importedItem = c;
          break;
        }
      }
    }

    if (!importedItem) {
      return jsonErr('Premiere did not import the file (unsupported format or import was blocked). Path: ' + normalizedPath);
    }

    var fileName = importedItem.name || 'imported-image';

    // 6. Place the clip on an EMPTY video track at the playhead.
    //    We never touch tracks that already hold footage — the image goes on
    //    its own empty track (creating one on top if necessary), using
    //    overwriteClip so existing clips are never shifted/rippled.
    var insertedIntoTimeline = false;
    try {
      var seq = app.project.activeSequence;
      if (seq) {
        var playheadSeconds = seq.getPlayerPosition().seconds;
        var numVideoTracks  = seq.videoTracks ? seq.videoTracks.numTracks : 0;

        var chosenTrack = null;

        // (a) Prefer a completely empty, unlocked video track
        for (var t = 0; t < numVideoTracks; t++) {
          var track = seq.videoTracks[t];
          if (track && !track.isLocked() && track.clips && track.clips.numItems === 0) {
            chosenTrack = track;
            break;
          }
        }

        // (b) No fully-empty track exists — create a NEW video track on top (QE DOM).
        //     We deliberately never reuse a track that holds any footage: a still's
        //     default duration could overwrite a nearby clip on that track. The image
        //     always lands on a track with zero existing clips, so the customer's
        //     footage is never overwritten, shifted, or touched.
        //     QE is pre-enabled at startup (initHost) so this won't zoom the timeline.
        if (!chosenTrack) {
          try {
            // Enable QE only if it isn't active yet (defensive — should already be on)
            var qeReady = true;
            try { if (typeof qe === 'undefined') qeReady = false; } catch (qx) { qeReady = false; }
            if (!qeReady) { app.enableQE(); }

            var qeSeq = qe.project.getActiveSequence();
            if (qeSeq) {
              // addTracks(numV, afterVideoIndex, numA, audioType, afterAudioIndex)
              try { qeSeq.addTracks(1, numVideoTracks, 0, 1, 0); }
              catch (e1) { try { qeSeq.addTracks(1, numVideoTracks); } catch (e2) {} }
            }
          } catch (qeErr) { /* QE unavailable */ }

          var newCount = seq.videoTracks ? seq.videoTracks.numTracks : numVideoTracks;
          if (newCount > numVideoTracks) {
            chosenTrack = seq.videoTracks[newCount - 1]; // newest = topmost track
          }
        }

        if (chosenTrack) {
          chosenTrack.overwriteClip(importedItem, playheadSeconds);
          insertedIntoTimeline = true;
        }
      }
    } catch (tlErr) {
      // Non-fatal: clip is still in the Project Panel even if timeline placement fails
    }

    return JSON.stringify({
      success: true,
      fileName: fileName,
      insertedIntoTimeline: insertedIntoTimeline
    });

  } catch (e) {
    return jsonErr('Import exception: ' + (e && e.message ? e.message : String(e)));
  }
}

// ─── getProjectBins ───────────────────────────────────────────────────────────

function getProjectBins() {
  try {
    if (!app || !app.project || !app.project.rootItem) return jsonErr('No project open');
    var bins = [];
    var root = app.project.rootItem;
    for (var i = 0; i < root.children.numItems; i++) {
      var item = root.children[i];
      if (item) {
        try { if (item.children !== undefined) bins.push(item.name); } catch (e) {}
      }
    }
    return JSON.stringify({ success: true, bins: bins });
  } catch (e) {
    return jsonErr(e.message || String(e));
  }
}

// ─── getProjectName ───────────────────────────────────────────────────────────

function getProjectName() {
  try {
    if (app && app.project) {
      return JSON.stringify({ success: true, name: app.project.name });
    }
    return jsonErr('No project open');
  } catch (e) {
    return jsonErr(e.message || String(e));
  }
}

// ─── revealInstantPasteBin ────────────────────────────────────────────────────

function revealInstantPasteBin() {
  try {
    if (!app || !app.project) return jsonErr('No project open');
    var root = app.project.rootItem;
    for (var i = 0; i < root.children.numItems; i++) {
      var item = root.children[i];
      if (item && item.name === 'Instant Paste') {
        item.select();
        return JSON.stringify({ success: true });
      }
    }
    return jsonErr('Instant Paste bin not found');
  } catch (e) {
    return jsonErr(e.message || String(e));
  }
}
