import api from '../lib/axios';

export async function downloadAuthenticatedFile(fileUrl, filename) {
  const { data } = await api.get(fileUrl, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}