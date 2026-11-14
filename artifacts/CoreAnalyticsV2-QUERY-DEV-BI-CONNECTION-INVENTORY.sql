select *
into #temp
from AppProgram
where programname like '%depo far%'


update a
set a.programID = '03.02.22',ProgramName = 'Pengajuan Perubahan HET',
    NavigateUrl = '~/Module/Inventory/Warehouse/PengajuanHET/PengajuanHETList.aspx'
from #temp a


insert into AppProgram
select *
from #temp