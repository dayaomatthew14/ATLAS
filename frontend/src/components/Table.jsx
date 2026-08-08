import { Edit, Trash2 } from 'lucide-react';

export default function Table({ columns, data, onEdit, onDelete, isLoading }) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-pulse">
        <div className="bg-gray-50 h-12 border-b border-gray-200"></div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 border-b border-gray-100 mx-4 flex items-center space-x-4">
            <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
            <div className="flex-1 h-4 bg-gray-100 rounded"></div>
            <div className="w-24 h-4 bg-gray-100 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300 font-black text-2xl">
          !
        </div>
        <h3 className="text-lg font-bold text-gray-800">No data found</h3>
        <p className="text-gray-500 text-sm mt-1">There are no records to display at the moment.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="px-8 py-5 text-left text-sm font-black text-slate-500 uppercase tracking-[0.1em]"
              >
                {col.label}
              </th>
            ))}
            {(onEdit || onDelete) && (
              <th scope="col" className="px-8 py-5 text-right text-sm font-black text-slate-500 uppercase tracking-[0.1em]">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((item, index) => (
            <tr key={item.id || index} className="hover:bg-gray-50 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className="px-8 py-6 whitespace-nowrap text-base font-bold text-slate-700">
                  {col.render ? col.render(item) : item[col.key]}
                </td>
              ))}
              {(onEdit || onDelete) && (
                <td className="px-8 py-6 whitespace-nowrap text-right text-base font-medium">
                  <div className="flex justify-end space-x-2">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(item)}
                        className="text-blue-600 hover:text-blue-900 p-2 hover:bg-blue-50 rounded-xl"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(item.id)}
                        className="text-rose-600 hover:text-rose-900 p-2 hover:bg-rose-50 rounded-xl"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
