import bpy,math,os
from pathlib import Path
output=Path(os.environ.get("SENDRACK_DESIGN_OUTPUT",str(Path(__file__).resolve().parents[2]/"artifacts/marketing-parcel")));output.mkdir(parents=True,exist_ok=True)
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=48;s.cycles.use_denoising=False;s.render.resolution_x=1000;s.render.resolution_y=1000;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.film_transparent=True;s.render.filepath=str(output/'parcel.png');s.world.color=(.75,.75,.75);s.view_settings.view_transform='AgX'
def mat(n,col,rough=.7):
 m=bpy.data.materials.new(n);m.diffuse_color=(*col,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough;return m
kraft=mat('Tactile kraft cardboard',(.48,.29,.12));p=kraft.node_tree.nodes.get('Principled BSDF');noise=kraft.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=180;noise.inputs['Roughness'].default_value=.8;bump=kraft.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.22;bump.inputs['Distance'].default_value=.035;kraft.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);kraft.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
tape=mat('SendRack orange paper tape',(1,.21,.008),.48);dark=mat('Charcoal print',(.035,.03,.025));paper=mat('Warm cream shipping label',(.92,.88,.79));shadow=mat('Ground',(.8,.8,.8))
def cube(n,loc,scale,m,r=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);b=o.modifiers.new('Subtle manufactured edge','BEVEL');b.width=r;b.segments=4;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o
cube('Sealed delivery parcel',(0,0,1.1),(2.4,1.9,2.1),kraft,.045)
# Fine top flap seam and a continuous orange tape strip.
cube('Top flap seam',(0,0,2.154),(2.25,.012,.005),dark,.001)
cube('Orange seal across top',(0,0,2.159),(.4,1.92,.018),tape,.009)
cube('Orange seal down front',(0,-.959,1.1),(.4,.018,2.08),tape,.008)
cube('Orange seal down back',(0,.959,1.1),(.4,.018,2.08),tape,.008)
# Right-side sample shipping label: deterministic typography and barcode, no personal data.
cube('Sample shipping label',(1.208,-.05,1.15),(.018,1.08,.78),paper,.015)
for i,w in enumerate([.016,.028,.012,.038,.02,.013,.03,.018,.035,.014,.024,.012,.03,.02,.04,.013]):cube('Decorative barcode',(1.222,-.49+i*.047,.98),(.004,w,.2),dark,.001)
def text(n,body,loc,size,rot,material=dark):
 curve=bpy.data.curves.new(n,'FONT');curve.body=body;curve.size=size;curve.extrude=.0008;curve.align_x='CENTER';o=bpy.data.objects.new(n,curve);s.collection.objects.link(o);o.location=loc;o.rotation_euler=rot;curve.materials.append(material);return o
text('Brand wordmark','SendRack',(-.5,-.976,1.43),.28,(math.pi/2,0,0))
text('Printed handling message','HANDLE WITH POSSIBILITY.',(-.52,-.977,1.2),.055,(math.pi/2,0,0))
text('Upright parcel label','SAMPLE PARCEL',(1.226,-.05,1.37),.088,(math.pi/2,0,math.pi/2))
# Small handling arrows on the front and a folded corrugated edge.
text('Upright arrows','↑  ↑',(.73,-.977,.51),.22,(math.pi/2,0,0))
for x in [-1.13,1.13]:cube('Folded edge detail',(x,-.965,1.09),(.009,.008,1.98),kraft,.002)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.025));floor=bpy.context.object;floor.hide_render=True;floor.is_shadow_catcher=True;floor.data.materials.append(shadow)
def area(loc,power,size):
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
area((-3,-4,7),650,5);area((4,1,5),450,4)
bpy.ops.object.camera_add(location=(5,-8,5));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=4.45;s.camera=cam
bpy.ops.wm.save_as_mainfile(filepath=str(output/'parcel.blend'));bpy.ops.render.render(write_still=True)
