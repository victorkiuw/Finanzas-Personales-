import { useLocalSearchParams } from 'expo-router';

import { FormularioMovimiento } from '../../components/FormularioMovimiento';

export default function EditarMovimiento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FormularioMovimiento key={id} id={Number(id)} />;
}
