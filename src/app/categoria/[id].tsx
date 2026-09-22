import { useLocalSearchParams } from 'expo-router';

import { FormularioCategoria } from '../../components/FormularioCategoria';

export default function EditarCategoria() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FormularioCategoria key={id} id={Number(id)} />;
}
