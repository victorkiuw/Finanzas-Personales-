import { useLocalSearchParams } from 'expo-router';

import { FormularioRecurrente } from '../../components/FormularioRecurrente';

export default function EditarRecurrente() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FormularioRecurrente key={id} id={Number(id)} />;
}
