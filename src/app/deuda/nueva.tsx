import { useLocalSearchParams } from 'expo-router';

import { FormularioDeuda } from '../../components/FormularioDeuda';

export default function NuevaDeuda() {
  const { ajeno, billetera } = useLocalSearchParams<{ ajeno?: string; billetera?: string }>();
  return <FormularioDeuda ajenoInicial={ajeno === '1'} billeteraInicial={billetera ? Number(billetera) : null} />;
}
