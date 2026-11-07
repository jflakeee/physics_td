export function lockCell(x,y,width,height){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<width&&y>=0&&y<height?{x,y,valid:false}:null;}
export function nudgeCell(cell,dx,dy,width,height){if(!cell||!Number.isInteger(dx)||!Number.isInteger(dy))return cell;return lockCell(cell.x+dx,cell.y+dy,width,height)||cell;}
