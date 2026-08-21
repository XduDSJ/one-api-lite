import React from 'react';

// 统一分页组件：7个数字位 + 首尾省略号
// 用法：<Pagination activePage={1} totalPages={41} onPageChange={(p) => setActivePage(p)} total={500} />
const Pagination = ({ activePage, totalPages, onPageChange, total }) => {
  if (totalPages <= 0) totalPages = 1;

  const pages = [];
  const add = (p) => pages.push({ type: 'page', value: p });
  const addEllipsis = () => pages.push({ type: 'ellipsis' });

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) add(i);
  } else {
    add(1);
    if (activePage <= 4) {
      // 靠近首页：显示 2,3,4,5,6
      for (let i = 2; i <= 6; i++) add(i);
      addEllipsis();
    } else if (activePage >= totalPages - 3) {
      // 靠近尾页
      addEllipsis();
      for (let i = totalPages - 5; i <= totalPages - 1; i++) add(i);
    } else {
      // 中间：当前页前后各2页
      addEllipsis();
      for (let i = activePage - 2; i <= activePage + 2; i++) add(i);
      addEllipsis();
    }
    add(totalPages);
  }

  return (
    <div className='aurora-pagination'>
      <span className='aurora-pagi-info'>
        共 {total ?? 0} 条 · 第 {activePage} / {totalPages} 页
      </span>
      <div className='aurora-pagi-btns'>
        <button className='aurora-pagi-btn' onClick={() => onPageChange(activePage - 1)} disabled={activePage <= 1}>‹</button>
        {pages.map((item, idx) => {
          if (item.type === 'ellipsis') {
            return <span key={`e${idx}`} className='aurora-pagi-btn' style={{ border: 'none', background: 'transparent', color: '#71717A', cursor: 'default' }}>…</span>;
          }
          return (
            <button
              key={item.value}
              className={`aurora-pagi-btn ${activePage === item.value ? 'active' : ''}`}
              onClick={() => onPageChange(item.value)}
            >{item.value}</button>
          );
        })}
        <button className='aurora-pagi-btn' onClick={() => onPageChange(activePage + 1)} disabled={activePage >= totalPages}>›</button>
      </div>
    </div>
  );
};

export default Pagination;
