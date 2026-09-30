import { PROPERTY_PINS } from '../../config/pins'
import PropertyPinLayer from '../pins/PropertyPinLayer'

const SKY_COLOR = '#dfe6ec'
const GROUND_COLOR = '#b9b4aa'

/** Scene-wide lighting: soft sky/ground fill plus a shadow-casting sun. */
function SceneLighting() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#8d8a82', 0.9]} />
      <directionalLight
        position={[18, 28, 12]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
    </>
  )
}

function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color={GROUND_COLOR} roughness={1} />
    </mesh>
  )
}

/**
 * Placeholder massing model. Replace with a loaded GLB/GLTF asset
 * (e.g. drei's useGLTF) once real architectural models are available.
 */
function PlaceholderBuilding() {
  return (
    <group>
      {/* Main volume */}
      <mesh position={[0, 3, 0]} castShadow receiveShadow>
        <boxGeometry args={[10, 6, 7]} />
        <meshStandardMaterial color="#f2f0eb" roughness={0.85} />
      </mesh>

      {/* Upper setback volume */}
      <mesh position={[-1.5, 7.5, -0.5]} castShadow receiveShadow>
        <boxGeometry args={[6, 3, 5]} />
        <meshStandardMaterial color="#e4e1da" roughness={0.85} />
      </mesh>

      {/* Roof slab */}
      <mesh position={[-1.5, 9.1, -0.5]} castShadow receiveShadow>
        <boxGeometry args={[6.6, 0.2, 5.6]} />
        <meshStandardMaterial color="#6f6c66" roughness={0.7} />
      </mesh>

      {/* Glazed frontage */}
      <mesh position={[0, 2.5, 3.51]}>
        <planeGeometry args={[8, 3.5]} />
        <meshStandardMaterial color="#4f6272" roughness={0.15} metalness={0.3} />
      </mesh>
    </group>
  )
}

/**
 * Root 3D scene contents: background, lighting, geometry and pins. Camera handling
 * lives in CameraController. Must be rendered inside a Canvas (see Web3DViewport).
 */
export default function ArchVizScene() {
  return (
    <>
      <color attach="background" args={[SKY_COLOR]} />

      <SceneLighting />
      <Ground />
      <PlaceholderBuilding />
      <PropertyPinLayer pins={PROPERTY_PINS} />
    </>
  )
}
