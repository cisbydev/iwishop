import api from './api';

export async function poserQuestion(question) {
  const response = await api.post('assistant/', { question });
  return response.data;
}
