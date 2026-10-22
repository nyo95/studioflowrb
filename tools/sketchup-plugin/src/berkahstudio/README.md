# Berkah Studio 1.1.7

Install `BerkahStudio_1.1.7.rbz` through SketchUp > Extension Manager > Install Extension, then restart SketchUp.

The installed package uses one loader, `berkahstudio.rb`, and one folder, `berkahstudio/`.

## Auto-Rename Material

1. Open Extensions > Berkah Studio > Auto-Rename Material, or click Auto-Rename on the Berkah Studio toolbar.
2. Click a surface painted with the material you want to rename.
3. Choose its category (nothing is preselected) and click OK.

HPL uses prefix PL. Codes have two digits like the StudioFlow Product Schedule, for example PL-01; an existing PL-1 counts
as the same code. The next number is chosen from material names in the model. Rename changes that shared material
everywhere it is used; texture and geometry are preserved. Undo is supported.

Component Tracker and Wall Finish Labels remain under Extensions > Berkah Studio.

## StudioFlow connection

Not available in this version. Taking codes from the Product Schedule, connecting with a personal token and refreshing
codes come with the StudioFlow SketchUp module.
