from fontTools.designspaceLib import DesignSpaceDocument, AxisDescriptor, SourceDescriptor
from fontTools import varLib
from fontTools.ttLib import TTFont
doc = DesignSpaceDocument()
a = AxisDescriptor(); a.tag='RAIN'; a.name='Rain'; a.minimum=0; a.default=0; a.maximum=100
doc.addAxis(a)
for lv in (0,50,100):
    s = SourceDescriptor(); s.path=f'master-{lv}.otf'; s.location={'Rain':lv}; s.familyName='Afterhour Rain Spike'; doc.addSource(s)
vf, _, _ = varLib.build(doc)
vf.save('AfterhourRainSpike-VF.otf')
f = TTFont('AfterhourRainSpike-VF.otf'); print('tables', sorted(f.keys())); print('axis', [(x.axisTag,x.minValue,x.maxValue) for x in f['fvar'].axes])
