import { useLocalSearchParams } from 'expo-router';

import { FormularioDeuda } from '../../../components/FormularioDeuda';

export default function EditarDeuda() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FormularioDeuda key={id} id={Number(id)} />;
}
