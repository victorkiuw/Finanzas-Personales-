import { useLocalSearchParams } from 'expo-router';

import { FormularioAjeno } from '../../../components/FormularioAjeno';

export default function EditarDineroAjeno() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FormularioAjeno key={id} id={Number(id)} />;
}
