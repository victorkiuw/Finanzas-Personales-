import { useLocalSearchParams } from 'expo-router';

import { FormularioMeta } from '../../../components/FormularioMeta';

export default function EditarMeta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FormularioMeta key={id} id={Number(id)} />;
}
