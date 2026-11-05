'use client';

import React, { useState } from 'react';
import { Document } from '../../types';

interface CashCalendarWidgetProps {
  documents: Document[];
  currency?: string;
  onSelectDate?: (date: string) => void;
}

export const CashCalendarWidget: React.FC<CashCalendarWidgetProps> = ({
  documents,
  currency = '₹',
  onSelectDate,
}) => {
  const symbol = (currency === 'INR' || !currency || currency === '₹') ? '₹' : currency;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(currentDate.getDate());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Calculate calendar days
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonthDays = new Date(year, month, 0).getDate();

  // Map documents to days of the current month
  const eventsByDay = React.useMemo(() => {
    const map: Record<number, { inflows: Document[]; outflows: Document[] }> = {};

    documents.forEach((doc) => {
      if (!doc.due_date) return;
      const d = new Date(doc.due_date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map[day]) map[day] = { inflows: [], outflows: [] };
        if (doc.document_type === 'invoice') {
          map[day].inflows.push(doc);
        } else {
          map[day].outflows.push(doc);
        }
      }
    });

    return map;
  }, [documents, year, month]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  };

  const selectedDayEvents = selectedDay && eventsByDay[selectedDay] ? eventsByDay[selectedDay] : null;

  return (
    <div className="business-card p-5 flex flex-col justify-between">
      {/* Calendar Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-slate-800">
            {monthNames[month]} {year}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            Obligations
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevMonth}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all text-xs"
            title="Previous month"
          >
            ◀
          </button>
          <button
            onClick={handleNextMonth}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all text-xs"
            title="Next month"
          >
            ▶
          </button>
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 uppercase py-2">
        {daysOfWeek.map((day) => (
          <div key={day}>{day[0]}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {/* Previous Month Padding */}
        {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
          <div
            key={`prev-${idx}`}
            className="p-1.5 text-slate-300 select-none text-[11px]"
          >
            {prevMonthDays - firstDayOfMonth + idx + 1}
          </div>
        ))}

        {/* Days of Current Month */}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const dayNum = idx + 1;
          const isSelected = selectedDay === dayNum;
          const hasEvents = !!eventsByDay[dayNum];
          const hasInflows = hasEvents && eventsByDay[dayNum].inflows.length > 0;
          const hasOutflows = hasEvents && eventsByDay[dayNum].outflows.length > 0;
          const isToday = new Date().toDateString() === new Date(year, month, dayNum).toDateString();

          return (
            <button
              key={`day-${dayNum}`}
              onClick={() => setSelectedDay(dayNum)}
              className={`p-1.5 rounded-xl flex flex-col items-center justify-center transition-all relative group ${
                isSelected
                  ? 'bg-indigo-600 text-white font-bold shadow-sm'
                  : isToday
                  ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <span className="text-[11px] leading-none">{dayNum}</span>

              {/* Event indicators */}
              {hasEvents && (
                <div className="flex gap-0.5 mt-1">
                  {hasInflows && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-300' : 'bg-emerald-500'}`} />
                  )}
                  {hasOutflows && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-amber-500'}`} />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Day Details Panel */}
      <div className="mt-3 pt-3 border-t border-slate-100 min-h-[56px] flex flex-col justify-center">
        {selectedDayEvents ? (
          <div className="space-y-1.5 text-xs">
            {selectedDayEvents.outflows.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between text-amber-700 font-medium">
                <span className="truncate max-w-[160px]">
                  Bill: {doc.contact_name || doc.document_number}
                </span>
                <span className="font-mono font-bold">
                  -{symbol}{doc.outstanding_amount.toLocaleString('en-IN')}
                </span>
              </div>
            ))}
            {selectedDayEvents.inflows.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between text-emerald-700 font-medium">
                <span className="truncate max-w-[160px]">
                  Invoice: {doc.contact_name || doc.document_number}
                </span>
                <span className="font-mono font-bold">
                  +{symbol}{doc.outstanding_amount.toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 text-center font-medium">
            {selectedDay ? `✓ Clear: No cash shifts on ${monthNames[month]} ${selectedDay}` : 'Select a date to view scheduled shifts'}
          </p>
        )}
      </div>
    </div>
  );
};

