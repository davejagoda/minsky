/*
  @copyright Steve Keen 2020
  @author Russell Standish
  This file is part of Minsky.

  Minsky is free software: you can redistribute it and/or modify it
  under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  Minsky is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with Minsky.  If not, see <http://www.gnu.org/licenses/>.
*/

#include "autoLayout.h"
#include "selection.h"
#include "minsky_epilogue.h"

#include <map>
#include <random>
#include <vector>

#include <boost/graph/fruchterman_reingold.hpp>
#include <boost/graph/topology.hpp>
#include <boost/graph/directed_graph.hpp>

using namespace std;
using namespace boost;
using namespace minsky;

namespace minsky
{
  namespace
  {
    inline double sqr(double x) {return x*x;}
    using Graph=boost::directed_graph<Item*>;

    // computes minimum distance two items can appriach each other
    double minD(const Item& item1, const Item& item2)
    {return std::max(item1.width()+item2.width(), item1.height()+item2.height());}
    
    // attractive force between connected items, repulsive when too close
    struct WireForce
    {
      double operator()(const Graph::edge_descriptor& e, double k, double d, const Graph& g)
      {
        auto from=g[source(e,g)], to=g[target(e,g)];
        if (d<minD(*from,*to))
          return 0;
        return d*d;
      }
    };

    struct RepulsiveForce
    {
      double operator()(const Graph::vertex_descriptor& v1, const Graph::vertex_descriptor& v2,
                        double k, double d, const Graph& g)
      {
        auto m=minD(*g[v1],*g[v2]);
        if (d<m)
          return k*k*m/(d*d);
        return k*k/d;
      }
    };

    // compute total area occupied by items
    double totalArea(const Group& g)
    {
      double area=0;
      for (auto& i: g.items)
        area+=i->width()*i->height();
      for (auto& i: g.groups)
        area+=i->width()*i->height();
      return area;
    }
  }
  
  void randomizeLayout(Group& g)
  {
    double layoutSize=sqrt(3*totalArea(g));
    default_random_engine gen;
    uniform_real_distribution<double> rng(0,1);
    for (auto& i: g.items)
      i->moveTo(layoutSize*rng(gen), layoutSize*rng(gen));
    for (auto& i: g.groups)
      i->moveTo(layoutSize*rng(gen), layoutSize*rng(gen));
  }

  void layoutGroup(Group& g)
  {
    
    Graph gg;
    map<Item*, decltype(gg.add_vertex())> vertexMap;
    for (auto& i: g.items)
      vertexMap.emplace(i.get(), gg.add_vertex(i.get())); 
    for (auto& i: g.groups)
      vertexMap.emplace(i.get(), gg.add_vertex(i.get())); 

    for (auto& w: g.wires)
      gg.add_edge(vertexMap[&w->from()->item()], vertexMap[&w->to()->item()]);

    using Topology=square_topology<>;
    
    using PosMap=std::map<decltype(gg.add_vertex()), Topology::point_type>;
    PosMap positions;
    boost::associative_property_map<PosMap> pm(positions);

    for (auto& i: vertexMap)
      {
        Topology::point_type p;
        p[0]=i.first->x();
        p[1]=i.first->y();
        positions[i.second]=p;
      }

    double layoutSize=sqrt(10*totalArea(g));
    fruchterman_reingold_force_directed_layout
      (gg,pm, Topology(layoutSize), attractive_force(WireForce()).repulsive_force(RepulsiveForce()));
    // maybe not needed
    //.force_pairs(boost::all_force_pairs())
    
    // move items to result of algorithm
    auto vertexRange=vertices(gg);
    for (auto i=vertexRange.first; i!=vertexRange.second; ++i)
      {
        auto p=pm[*i];
        gg[*i]->moveTo(p[0]+layoutSize,p[1]+layoutSize);
      }
    
    for (auto& i: g.groups)
      layoutGroup(*i);
  }
}
