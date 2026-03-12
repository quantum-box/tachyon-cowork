import { Sun, Moon, Monitor } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

type Props = {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
};

const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'ライト', Icon: Sun },
  { value: 'dark', label: 'ダーク', Icon: Moon },
  { value: 'system', label: 'システム', Icon: Monitor },
];

export function ThemeToggle({ theme, onThemeChange }: Props) {
  return (
    <div className="flex rounded-lg bg-gray-100 dark:bg-slate-700 p-0.5">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => onThemeChange(value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
            theme === value
              ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Icon size={12} />
          {label}
        </button>
      ))}
    </div>
  );
}
