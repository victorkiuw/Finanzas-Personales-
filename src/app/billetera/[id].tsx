import { useLocalSearchParams } from 'expo-router';

import { FormularioBilletera } from '../../components/FormularioBilletera';

export default function EditarBilletera() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FormularioBilletera key={id} id={Number(id)} />;
}
